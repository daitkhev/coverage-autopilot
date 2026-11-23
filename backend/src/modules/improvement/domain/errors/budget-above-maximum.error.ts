import { DomainError } from '#kernel/errors/domain.error';

/**
 * A request for more of a limit than the service allows, or for a limit
 * the service has none of, such as tokens under a subscription.
 */
export class BudgetAboveMaximumError extends DomainError {
  public readonly code = 'budget_above_maximum';
  public readonly retryable = false;
}
