import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The CLI reported that it started with other tools than the allowed
 * ones, or with a tool server. Something switched a protection off, so
 * what the run wrote is not used, and a second run would start the same.
 */
export class GeneratorUnsafeStartError extends InfrastructureError {
  public readonly code = 'generator_unsafe_start';
  public readonly retryable = false;
}
