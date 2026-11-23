import { Inject, Injectable } from '@nestjs/common';

import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import {
  mutantOf,
  survivingMutantDtoOf,
} from '#verification/application/dto/verification-dto-mapping';
import {
  leftOutTestFilesOf,
  passesAsBefore,
} from '#verification/application/failing-tests';
import {
  type CompletedMutationRun,
  MUTATION_RUNNER,
  type MutationRunner,
  type MutationToolResult,
} from '#verification/application/ports/mutation-runner.port';
import {
  VERIFICATION_SETTINGS,
  type VerificationSettings,
} from '#verification/application/verification-settings';
import {
  type MutantCounts,
  mutationGainOf,
  type PatchedMutationRun,
} from '#verification/domain/services/mutation-gain.service';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';
import type { MutationBaseline } from '#verification/domain/value-objects/mutation-baseline.vo';

const PERCENT = 100;

/** The checks whose failure means some test fails with the patch. */
const TEST_CHECKS: readonly CheckName[] = [
  'new_tests_pass',
  'existing_tests_pass',
  'repeated_runs',
];

interface MeasuredRuns {
  readonly baseline: MutationBaseline;
  readonly run: CompletedMutationRun;
}

function patchedRunOf(run: CompletedMutationRun): PatchedMutationRun {
  return {
    tool: run.tool,
    mutantSetHash: run.mutantSetHash,
    mutants: run.mutants.map((each) => ({
      mutant: mutantOf(each),
      status: each.status,
      testFiles: [...each.coveredBy, ...each.killedBy].map(({ file }) => file),
    })),
  };
}

function shortfallOf(counts: MutantCounts, copy: PatchedCopy): string {
  const { killed, reached, undetectedBefore } = counts;
  if (killed === 0) {
    return `The new tests kill none of the ${String(undetectedBefore)} mutants of ${copy.command.targetFile.value} that no test detected.`;
  }
  const rate = Math.floor((killed * PERCENT) / reached);
  return `The new tests kill ${String(killed)} of the ${String(reached)} undetected mutants they reach, ${String(rate)}%, below the threshold of ${String(copy.policy.mutationThreshold)}%.`;
}

/**
 * The tool cannot sit beside the runner of the project, which running the
 * check again does not change.
 */
function uninstalledOf(
  tool: Extract<MutationToolResult, { outcome: 'unsupported' }>,
): CheckResult {
  return CheckResult.error('mutation_gain', {
    message: `The mutation tool cannot be installed in the project: ${tool.detail}`,
    retryable: false,
    outputReference: tool.outputReference,
  });
}

/** The seventh check: the new tests kill mutants no test detected before. */
@Injectable()
export class MutationGainCheck implements PatchCheck {
  public readonly name: CheckName = 'mutation_gain';
  private readonly runner: MutationRunner;
  private readonly settings: VerificationSettings;

  public constructor(
    @Inject(MUTATION_RUNNER) runner: MutationRunner,
    @Inject(VERIFICATION_SETTINGS) settings: VerificationSettings,
  ) {
    this.runner = runner;
    this.settings = settings;
  }

  /**
   * The tool runs every test before it mutates anything and stops when one
   * fails, so a patch whose tests fail would end as an error of the tool
   * and hide the failure that rejects it. Tests that failed before the
   * patch are left out of the tool, so they stop nothing.
   */
  public inapplicability(copy: PatchedCopy): string | null {
    const failing = TEST_CHECKS.some((name) => {
      const status = copy.book.statusOf(name);
      return status === 'failed' || status === 'error';
    });
    const fullRun = copy.fullRun.finished;
    const before = copy.command.baseline.failingTests;
    return failing || (fullRun !== null && !passesAsBefore(fullRun, before))
      ? 'Some tests fail with the patch, so the mutation tool cannot run.'
      : null;
  }

  public async run(
    copy: PatchedCopy,
    signal: AbortSignal,
  ): Promise<CheckResult> {
    const baseline = copy.mutationBaseline;
    if (baseline === null) {
      return CheckResult.error(this.name, {
        message:
          'The baseline holds no measure of the mutants, which the policy requires.',
        retryable: false,
      });
    }
    if (copy.mutationTool?.outcome === 'unsupported') {
      return uninstalledOf(copy.mutationTool);
    }
    const run = await this.runner.measureWithPatch(
      {
        ...copy.loan,
        targetFile: copy.command.targetFile,
        leftOutTestFiles: leftOutTestFilesOf(
          copy.command.baseline.failingTests,
        ),
        testRunner: copy.testRunner,
        timeoutMs: copy.deadline.limit(this.settings.mutationRunTimeoutMs),
        baselineCacheReference: baseline.cacheReference,
      },
      signal,
    );
    const { outputReference } = run;
    switch (run.outcome) {
      case 'unsupported':
        return CheckResult.error(this.name, {
          message: `The mutation tool cannot run on the project: ${run.detail}`,
          retryable: false,
          outputReference,
        });
      case 'timed_out':
        return CheckResult.error(this.name, {
          message: 'The mutation tool ran out of time.',
          retryable: true,
          outputReference,
        });
      case 'completed':
        return this.judged(copy, { baseline, run });
    }
  }

  private judged(copy: PatchedCopy, runs: MeasuredRuns): CheckResult {
    const gain = mutationGainOf({
      baseline: runs.baseline,
      run: patchedRunOf(runs.run),
      newTestFiles: copy.newTestFiles,
      threshold: copy.policy.mutationThreshold,
      survivorLimit: this.settings.survivingMutantLimit,
    });
    const evidence = { outputReference: runs.run.outputReference };
    if (gain.outcome === 'incomparable') {
      return CheckResult.error(this.name, {
        ...evidence,
        message: gain.reason,
        retryable: false,
      });
    }
    copy.evidence.mutation = {
      counts: gain.counts,
      surviving: gain.surviving.map(survivingMutantDtoOf),
    };
    return gain.passed
      ? CheckResult.passed(this.name, evidence)
      : CheckResult.failed(this.name, shortfallOf(gain.counts, copy), evidence);
  }
}
