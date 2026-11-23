import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/** Settings the module cannot work with. The service does not start. */
export class InvalidRepositoriesSettingsError extends InfrastructureError {
  public readonly code = 'invalid_repositories_settings';
  public readonly retryable = false;
}
