import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/** Settings no improvement can run with. The service does not start. */
export class InvalidImprovementSettingsError extends InfrastructureError {
  public readonly code = 'invalid_improvement_settings';
  public readonly retryable = false;
}
