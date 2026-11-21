import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * Variables of the environment the service cannot start with. The message
 * names each of them with what it expects, and never a value, since a
 * value may be a secret. A person has to change them, so a second start
 * fails the same way.
 */
export class InvalidServiceConfigError extends InfrastructureError {
  public readonly code = 'invalid_service_config';
  public readonly retryable = false;
}
