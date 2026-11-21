import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoverageCounterDto,
  type CoveragePublicApi,
  type CoverageSnapshotDto,
  type FileCoverageDto,
  type MeasuredFileDto,
  type RunCoverageDto,
  type ScanParametersDto,
} from '#coverage/contracts/coverage-public-api';
import type { FilePath } from '#kernel/primitives/file-path';
import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import { unsupportedRunOf } from '#verification/application/commands/verify-patch/checks/test-run-result';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import type { TargetCoverageDto } from '#verification/contracts/verification-public-api';
import {
  type CoverageComparison,
  coverageGainOf,
} from '#verification/domain/services/coverage-gain.service';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/** What the two measurements of the target file need to compare. */
interface Measurements {
  readonly target: FilePath;
  readonly snapshot: CoverageSnapshotDto | null;
  readonly before: FileCoverageDto | null;
  readonly after: RunCoverageDto | null;
}

type Comparison =
  | ({ readonly outcome: 'comparable' } & CoverageComparison)
  | { readonly outcome: 'incomparable'; readonly reason: string };

function targetCoverageOf(file: MeasuredFileDto): TargetCoverageDto {
  const { statements, branches, functions, lines } = file.counters;
  const counter = ({ covered, total }: CoverageCounterDto) => ({
    covered,
    total,
  });
  return {
    statements: counter(statements),
    branches: counter(branches),
    functions: counter(functions),
    lines: counter(lines),
  };
}

function sameTools(left: ScanParametersDto, right: ScanParametersDto): boolean {
  return (
    left.testRunner === right.testRunner &&
    left.testRunnerVersion === right.testRunnerVersion &&
    left.coverageProvider === right.coverageProvider &&
    left.fileListRule === right.fileListRule
  );
}

/**
 * Numbers compare only between measurements of the same file with the
 * same tools. Anything else is a report that cannot be finished, never a
 * fault of the patch.
 */
function comparisonOf(measurements: Measurements): Comparison {
  const { target, snapshot, before, after } = measurements;
  const incomparable = (reason: string): Comparison => ({
    outcome: 'incomparable',
    reason,
  });
  if (snapshot === null || before?.state !== 'measured') {
    return incomparable(
      `The baseline snapshot has no measure of ${target.value}.`,
    );
  }
  if (after === null || !sameTools(snapshot.parameters, after.parameters)) {
    return incomparable(
      'The run with the patch did not measure coverage with the tools of the baseline snapshot.',
    );
  }
  const file = after.files.find(({ path }) => path.equals(target));
  if (file?.state !== 'measured') {
    return incomparable(
      `The run with the patch did not measure ${target.value}.`,
    );
  }
  return {
    outcome: 'comparable',
    metric: snapshot.threshold.metric,
    before: targetCoverageOf(before),
    after: targetCoverageOf(file),
  };
}

/**
 * The sixth check: the target file is better covered with the patch. It
 * reads the run of every test the fourth check made, and compares the
 * coverage even when a test of that run failed: the counters of the target
 * are still measured, and the fourth check already rejects the failure.
 */
@Injectable()
export class CoverageIncreaseCheck implements PatchCheck {
  public readonly name: CheckName = 'coverage_increase';
  private readonly coverage: CoveragePublicApi;

  public constructor(@Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi) {
    this.coverage = coverage;
  }

  public inapplicability(): null {
    return null;
  }

  public async run(
    copy: PatchedCopy,
    signal: AbortSignal,
  ): Promise<CheckResult> {
    const run = await copy.fullRun.result(signal);
    if (run.outcome === 'unsupported') {
      return unsupportedRunOf(this.name, run.detail);
    }
    const { outputReference, status } = run.testRun;
    if (status === 'timed_out') {
      return CheckResult.error(this.name, {
        message: 'The tests ran out of time, so no coverage was measured.',
        retryable: true,
        outputReference,
      });
    }
    const comparison = comparisonOf(
      await this.measurementsOf(copy, run.coverage),
    );
    if (comparison.outcome === 'incomparable') {
      return CheckResult.error(this.name, {
        message: comparison.reason,
        retryable: false,
        outputReference,
      });
    }
    copy.evidence.coverage = {
      before: comparison.before,
      after: comparison.after,
    };
    return this.judged(comparison, copy.command.targetFile, outputReference);
  }

  private async measurementsOf(
    copy: PatchedCopy,
    after: RunCoverageDto | null,
  ): Promise<Measurements> {
    const snapshotId = copy.command.baselineSnapshotId;
    const target = copy.command.targetFile;
    return {
      target,
      snapshot: await this.coverage.getSnapshot({ snapshotId }),
      before: await this.coverage.getFileCoverage({ snapshotId, path: target }),
      after,
    };
  }

  private judged(
    comparison: CoverageComparison,
    target: FilePath,
    outputReference: string | null,
  ): CheckResult {
    const gain = coverageGainOf(comparison);
    const { before, after, metric } = comparison;
    switch (gain.outcome) {
      case 'increased':
        return CheckResult.passed(this.name, { outputReference });
      case 'unchanged':
        return CheckResult.failed(
          this.name,
          `The new tests cover no more ${metric} of ${target.value}: ${String(after[metric].covered)} of ${String(after[metric].total)}, as before.`,
          { outputReference },
        );
      case 'decreased':
        return CheckResult.failed(
          this.name,
          `Fewer ${gain.metric} of ${target.value} are covered with the patch: ${String(after[gain.metric].covered)}, against ${String(before[gain.metric].covered)} before.`,
          { outputReference },
        );
    }
  }
}
