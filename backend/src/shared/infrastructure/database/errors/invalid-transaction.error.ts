import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A transaction handle that this database did not make, or one used after
 * its transaction ended. Either is a mistake in the code, not in the data.
 */
export class InvalidTransactionError extends InfrastructureError {
  public readonly code = 'invalid_transaction';
  public readonly retryable = false;
}
