import { Injectable } from '@nestjs/common';

import type { TestRunDto } from '#coverage/application/contracts/coverage-public-api';
import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import { testRunResultOf } from '#verification/application/commands/verify-patch/checks/test-run-result';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import type { FailingTestDto } from '#verification/application/contracts/verification-public-api';
import {
  brokenTestsOf,
  failureAmong,
  firstOf,
  firstWords,
} from '#verification/application/failing-tests';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/**
 * A commit whose tests ran out of time, or whose failing tests a baseline
 * of the first version did not name, cannot show what a patch broke.
 */
const NOTHING_TO_COMPARE: Readonly<Record<'failed' | 'timed_out', string>> = {
  failed:
    'Some tests of the commit failed before the patch and the baseline does not name them, so a run cannot show what the patch broke.',
  timed_out:
    'The tests of the commit ran out of time before the patch, so a run cannot show what the patch broke.',
};

const FAILED = 'Tests of the project fail with the new tests.';

const NAME: CheckName = 'existing_tests_pass';

function leftOutWords(before: readonly FailingTestDto[]): string {
  return `Left out: ${String(before.length)} that failed before the patch.`;
}

function brokenWords(
  broken: readonly FailingTestDto[],
  before: readonly FailingTestDto[],
): string {
  const first = firstOf(broken);
  const naming = first === undefined ? '' : ` ${firstWords(first)}`;
  return (
    `Tests that passed before the patch fail with it: ` +
    `${String(broken.length)}.${naming} ${leftOutWords(before)}`
  );
}

/**
 * A run that finished, judged against the tests that failed before the
 * patch: they are left out, and any other failure is the patch's.
 */
function comparedResultOf(
  run: TestRunDto,
  before: readonly FailingTestDto[],
): CheckResult {
  const { outputReference, firstFailure } = run;
  const broken = brokenTestsOf(run, before);
  if (broken === null) {
    return CheckResult.failed(
      NAME,
      `${FAILED} Their runner named no test, so the tests that failed before the patch cannot be left out.`,
      { outputReference, testFailure: firstFailure },
    );
  }
  return broken.length === 0
    ? CheckResult.passedWith(NAME, leftOutWords(before), { outputReference })
    : CheckResult.failed(NAME, brokenWords(broken, before), {
        outputReference,
        testFailure: failureAmong(firstFailure, broken),
      });
}

/**
 * The fourth check: every test that passed before the patch passes with
 * it. Tests that failed before are the commit's, so they are left out.
 */
@Injectable()
export class ExistingTestsCheck implements PatchCheck {
  public readonly name: CheckName = NAME;

  public inapplicability(copy: PatchedCopy): string | null {
    const { existingTests, failingTests } = copy.command.baseline;
    if (failingTests !== null) {
      return null;
    }
    return existingTests === 'timed_out'
      ? NOTHING_TO_COMPARE.timed_out
      : NOTHING_TO_COMPARE.failed;
  }

  public async run(
    copy: PatchedCopy,
    signal: AbortSignal,
  ): Promise<CheckResult> {
    const run = await copy.fullRun.result(signal);
    const before = copy.command.baseline.failingTests ?? [];
    const result = testRunResultOf({
      name: this.name,
      run,
      failed: FAILED,
      timedOut: 'The tests of the project ran out of time with the new tests.',
      runs: null,
    });
    const unjudged =
      before.length === 0 ||
      run.outcome !== 'completed' ||
      result.status === 'error';
    return unjudged ? result : comparedResultOf(run.testRun, before);
  }
}
