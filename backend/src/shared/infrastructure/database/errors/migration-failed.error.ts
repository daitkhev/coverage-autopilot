import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A migration that could not finish. It was rolled back, so the database
 * is as it was before, and the service does not start.
 */
export class MigrationFailedError extends InfrastructureError {
  public readonly code = 'migration_failed';
  public readonly retryable = false;
}
