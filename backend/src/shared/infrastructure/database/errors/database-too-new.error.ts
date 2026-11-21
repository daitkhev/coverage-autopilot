import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A newer service migrated the database. Migrations only go forward, so
 * this service leaves it as it is and does not start.
 */
export class DatabaseTooNewError extends InfrastructureError {
  public readonly code = 'database_too_new';
  public readonly retryable = false;
}
