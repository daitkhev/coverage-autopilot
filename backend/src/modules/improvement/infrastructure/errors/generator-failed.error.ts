import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The CLI failed for a reason that is neither a limit nor its login, such
 * as an error of the model's service or a crash. Such a reason often
 * passes, so a later run can help.
 */
export class GeneratorFailedError extends InfrastructureError {
  public readonly code = 'generator_failed';
  public readonly retryable = true;
}
