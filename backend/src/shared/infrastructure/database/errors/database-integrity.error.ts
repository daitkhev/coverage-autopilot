import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The file is damaged, or a row refers to a row that is not there. Work
 * on such a database could build on data that is wrong, so it stops.
 */
export class DatabaseIntegrityError extends InfrastructureError {
  public readonly code = 'database_integrity';
  public readonly retryable = false;
}
