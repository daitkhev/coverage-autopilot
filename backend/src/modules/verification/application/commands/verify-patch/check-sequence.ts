import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '#kernel/time/clock';
import type { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import { CompilerCheck } from '#verification/application/commands/verify-patch/checks/compiler-check';
import { CoverageIncreaseCheck } from '#verification/application/commands/verify-patch/checks/coverage-increase-check';
import { ExistingTestsCheck } from '#verification/application/commands/verify-patch/checks/existing-tests-check';
import { MutationGainCheck } from '#verification/application/commands/verify-patch/checks/mutation-gain-check';
import { NewTestsCheck } from '#verification/application/commands/verify-patch/checks/new-tests-check';
import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import { RepeatedRunsCheck } from '#verification/application/commands/verify-patch/checks/repeated-runs-check';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import { Stopwatch } from '#verification/application/stopwatch';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';
import type { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

/** The checks that did not run, and the result each required one gets. */
export interface ChecksNotRun {
  readonly book: CheckBook;
  readonly policy: QualityPolicy;
  readonly resultOf: (name: CheckName) => CheckResult;
}

/**
 * The second to the seventh check, in order, in a patched copy. A check the
 * policy does not require is skipped. A check that failed does not stop the
 * ones after it, so the generator hears every reason at once; a check that
 * makes no sense after an earlier result says so through its own
 * `inapplicability`. A check that starts after the deadline cannot finish.
 */
@Injectable()
export class CheckSequence {
  private readonly checks: readonly PatchCheck[];
  private readonly clock: Clock;

  public constructor(
    @Inject(CompilerCheck) compiler: CompilerCheck,
    @Inject(NewTestsCheck) newTests: NewTestsCheck,
    @Inject(ExistingTestsCheck) existingTests: ExistingTestsCheck,
    @Inject(RepeatedRunsCheck) repeatedRuns: RepeatedRunsCheck,
    @Inject(CoverageIncreaseCheck) coverageIncrease: CoverageIncreaseCheck,
    @Inject(MutationGainCheck) mutationGain: MutationGainCheck,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.checks = [
      compiler,
      newTests,
      existingTests,
      repeatedRuns,
      coverageIncrease,
      mutationGain,
    ];
    this.clock = clock;
  }

  public async run(copy: PatchedCopy, signal: AbortSignal): Promise<void> {
    for (const check of this.checks) {
      signal.throwIfAborted();
      copy.book.record(await this.resultOf(check, copy, signal));
    }
  }

  /** Records every check without running one. */
  public notRun(checks: ChecksNotRun): void {
    for (const { name } of this.checks) {
      checks.book.record(
        checks.policy.requires(name)
          ? checks.resultOf(name)
          : CheckResult.skipped(name),
      );
    }
  }

  private async resultOf(
    check: PatchCheck,
    copy: PatchedCopy,
    signal: AbortSignal,
  ): Promise<CheckResult> {
    const { name } = check;
    if (!copy.policy.requires(name)) {
      return CheckResult.skipped(name);
    }
    const inapplicability = check.inapplicability(copy);
    if (inapplicability !== null) {
      return CheckResult.notApplicable(name, inapplicability);
    }
    if (copy.deadline.hasPassed()) {
      return CheckResult.error(name, {
        message: 'The deadline passed before the check started.',
        retryable: true,
      });
    }
    copy.book.begin(name);
    const stopwatch = Stopwatch.started(this.clock);
    const result = await check.run(copy, signal);
    return result.withDuration(stopwatch.elapsedMs());
  }
}
