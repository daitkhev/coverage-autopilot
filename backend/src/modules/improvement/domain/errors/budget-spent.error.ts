import { DomainError } from '#kernel/errors/domain.error';

/**
 * An attempt asked for when the budget allows none. The caller asks the
 * improvement first, so this is a fault of the caller, not an outcome.
 */
export class BudgetSpentError extends DomainError {
  public readonly code = 'budget_spent';
  public readonly retryable = false;
}
