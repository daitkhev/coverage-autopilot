import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/** Settings the gate cannot work with. The service does not start. */
export class InvalidVerificationSettingsError extends InfrastructureError {
  public readonly code = 'invalid_verification_settings';
  public readonly retryable = false;
}
