import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The CLI refused the credential it was given, or had none. Running again
 * helps only after the owner gives it a credential that works.
 */
export class GeneratorLoginFailedError extends InfrastructureError {
  public readonly code = 'generator_login_failed';
  public readonly retryable = false;
}
