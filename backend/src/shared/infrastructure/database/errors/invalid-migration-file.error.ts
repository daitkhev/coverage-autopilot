import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The folder of migrations is not a numbered list without gaps. The order
 * of the files is the order of the versions, so the service does not guess.
 */
export class InvalidMigrationFileError extends InfrastructureError {
  public readonly code = 'invalid_migration_file';
  public readonly retryable = false;
}
