import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
} from '#coverage/application/contracts/coverage-public-api';
import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import { testRunResultOf } from '#verification/application/commands/verify-patch/checks/test-run-result';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import type {
  CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/** The third check: the test files of the patch pass. */
@Injectable()
export class NewTestsCheck implements PatchCheck {
  public readonly name: CheckName = 'new_tests_pass';
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
    const run = await this.coverage.runTests(
      { ...copy.loan, testFiles: copy.newTestFiles, withCoverage: false },
      signal,
    );
    return testRunResultOf({
      name: this.name,
      run,
      failed: 'The new tests fail.',
      timedOut: 'The new tests ran out of time.',
      runs: null,
    });
  }
}
