import { Inject, Injectable } from '@nestjs/common';

import type { PatchCheck } from '#verification/application/commands/verify-patch/checks/patch-check';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import {
  TYPE_CHECKER,
  type TypeChecker,
} from '#verification/application/ports/type-checker.port';
import {
  VERIFICATION_SETTINGS,
  type VerificationSettings,
} from '#verification/application/verification-settings';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/** Why a commit that does not type-check gives nothing to compare with. */
const NOTHING_TO_COMPARE: Readonly<Record<'fails' | 'absent', string>> = {
  fails:
    'The commit does not type-check without the patch, so there is nothing to compare with.',
  absent:
    'The project has no TypeScript compiler or no tsconfig.json at its root.',
};

/** The second check: the project still type-checks with the new tests. */
@Injectable()
export class CompilerCheck implements PatchCheck {
  public readonly name: CheckName = 'type_check';
  private readonly checker: TypeChecker;
  private readonly settings: VerificationSettings;

  public constructor(
    @Inject(TYPE_CHECKER) checker: TypeChecker,
    @Inject(VERIFICATION_SETTINGS) settings: VerificationSettings,
  ) {
    this.checker = checker;
    this.settings = settings;
  }

  public inapplicability(copy: PatchedCopy): string | null {
    const before = copy.command.baseline.typeCheck;
    return before === 'passes' ? null : NOTHING_TO_COMPARE[before];
  }

  public async run(
    copy: PatchedCopy,
    signal: AbortSignal,
  ): Promise<CheckResult> {
    const timeoutMs = copy.deadline.limit(this.settings.typeCheckTimeoutMs);
    const result = await this.checker.check(
      { ...copy.loan, timeoutMs },
      signal,
    );
    if (result.outcome === 'absent') {
      return CheckResult.error(this.name, {
        message: 'The compiler the commit had is missing with the patch.',
        retryable: false,
      });
    }
    const { outputReference } = result;
    switch (result.outcome) {
      case 'passes':
        return CheckResult.passed(this.name, { outputReference });
      case 'fails':
        return CheckResult.failed(
          this.name,
          'The project does not type-check with the new test files.',
          { outputReference },
        );
      case 'timed_out':
        return CheckResult.error(this.name, {
          message: 'The type check ran out of time.',
          retryable: true,
          outputReference,
        });
    }
  }
}
