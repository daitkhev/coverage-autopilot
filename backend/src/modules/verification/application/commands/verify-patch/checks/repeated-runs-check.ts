import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
} from '#coverage/application/contracts/coverage-public-api';
import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import { testRunResultOf } from '#verification/application/commands/verify-patch/checks/test-run-result';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/** The fifth check: the new tests pass several runs in a row. */
@Injectable()
export class RepeatedRunsCheck implements PatchCheck {
  public readonly name: CheckName = 'repeated_runs';
  private readonly coverage: CoveragePublicApi;

  public constructor(@Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi) {
    this.coverage = coverage;
  }

  /** Tests that did not pass once cannot pass several times in a row. */
  public inapplicability(copy: PatchedCopy): string | null {
    const once = copy.book.statusOf('new_tests_pass');
    return once === 'failed' || once === 'error'
      ? 'The new tests did not pass once, so they were not run again.'
      : null;
  }

  public async run(
    copy: PatchedCopy,
    signal: AbortSignal,
  ): Promise<CheckResult> {
    const total = copy.policy.repeatedRuns;
    let outputReference: string | null = null;
    for (let done = 1; done <= total; done += 1) {
      if (done > 1 && copy.deadline.hasPassed()) {
        return this.cutShort({ done: done - 1, total });
      }
      const run = await this.coverage.runTests(
        { ...copy.loan, testFiles: copy.newTestFiles, withCoverage: false },
        signal,
      );
      copy.book.repeat(this.name, { done, total });
      if (run.outcome === 'unsupported' || run.testRun.status !== 'passed') {
        const of = `run ${String(done)} of ${String(total)}`;
        return testRunResultOf({
          name: this.name,
          run,
          failed: `The new tests failed on ${of}.`,
          timedOut: `The new tests ran out of time on ${of}.`,
          runs: done,
        });
      }
      outputReference = run.testRun.outputReference;
    }
    return CheckResult.passed(this.name, { runs: total, outputReference });
  }

  private cutShort(runs: {
    readonly done: number;
    readonly total: number;
  }): CheckResult {
    return CheckResult.error(this.name, {
      message: `The deadline passed after run ${String(runs.done)} of ${String(runs.total)}.`,
      retryable: true,
      runs: runs.done,
    });
  }
}
