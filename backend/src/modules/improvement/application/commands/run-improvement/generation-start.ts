import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { BudgetLimit } from '#improvement/domain/value-objects/budget.vo';
import { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { Instant } from '#kernel/time/instant';

function budgetSpentOf(
  improvement: Improvement,
  spent: BudgetLimit,
): ImprovementFailure {
  const limit = String(improvement.request.budget[spent]);
  return ImprovementFailure.create({
    reason: 'budget_exhausted',
    message:
      `The limit of ${spent} of the budget (${limit}) is spent, so no new ` +
      'attempt opens.',
  });
}

/**
 * Opens the attempt to generate with, or fails the improvement when the
 * budget allows no new one. The domain refuses to open an attempt with a
 * spent budget, so the allowance is asked first, at the same moment.
 */
export function openAttemptWithinBudget(
  improvement: Improvement,
  at: Instant,
): void {
  const allowance = improvement.attemptAllowance(at);
  if (allowance.allowed) {
    improvement.openAttempt(at);
  } else {
    improvement.fail(budgetSpentOf(improvement, allowance.spent), at);
  }
}

/**
 * Fails an improvement whose fresh snapshot is gone. Without it the
 * generator cannot be told the test runner or what no test reaches, and
 * a snapshot is never measured again, so a retry would not help.
 */
export function failWithoutSnapshot(
  improvement: Improvement,
  at: Instant,
): void {
  const { targetFile } = improvement.request;
  improvement.fail(
    ImprovementFailure.create({
      reason: 'stale_snapshot',
      message:
        `The fresh snapshot of ${targetFile.value} is not stored any more, ` +
        'so the generator cannot be told what no test reaches. Scan the ' +
        'repository again.',
    }),
    at,
  );
}
