import { Injectable } from '@nestjs/common';

import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import { testRunResultOf } from '#verification/application/commands/verify-patch/checks/test-run-result';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import type {
  CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/**
 * A run answers only whether it passed, not which tests did, so a commit
 * whose own tests did not pass cannot show what a patch broke.
 */
const NOTHING_TO_COMPARE: Readonly<Record<'failed' | 'timed_out', string>> = {
  failed:
    'Some tests of the commit failed before the patch, so a run cannot show what the patch broke.',
  timed_out:
    'The tests of the commit ran out of time before the patch, so a run cannot show what the patch broke.',
};

/** The fourth check: every test passes with the patch, as it did before. */
@Injectable()
export class ExistingTestsCheck implements PatchCheck {
  public readonly name: CheckName = 'existing_tests_pass';

  public inapplicability(copy: PatchedCopy): string | null {
    const before = copy.command.baseline.existingTests;
    return before === 'passed' ? null : NOTHING_TO_COMPARE[before];
  }

  public async run(
    copy: PatchedCopy,
    signal: AbortSignal,
  ): Promise<CheckResult> {
    return testRunResultOf({
      name: this.name,
      run: await copy.fullRun.result(signal),
      failed: 'Tests of the project fail with the new tests.',
      timedOut: 'The tests of the project ran out of time with the new tests.',
      runs: null,
    });
  }
}
