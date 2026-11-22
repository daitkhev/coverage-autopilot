import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';

import type { CheckAccessHandler } from '#repositories/application/commands/check-access/check-access.handler';

/** An access check of a repository that is there. */
type CheckedAccess = NonNullable<
  Awaited<ReturnType<CheckAccessHandler['execute']>>
>;

/** The access check in the words of the contract. */
export function accessCheckAnswerOf(check: CheckedAccess): AccessCheck {
  return {
    repositoryId: check.repositoryId.value,
    checkedAt: check.checkedAt.toString(),
    passed: check.passed,
    headCommit: check.headCommit?.value ?? null,
    steps: check.steps.map((step) => ({
      name: step.name,
      status: step.status,
      message: step.message,
      toolOutput: step.toolOutput,
    })),
  };
}
