import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The CLI said it succeeded and printed what the adapter cannot read: an
 * event it relies on in another shape, or no result at all. Another
 * version of the CLI is the likely cause, which a second run keeps.
 */
export class GeneratorOutputUnreadableError extends InfrastructureError {
  public readonly code = 'generator_output_unreadable';
  public readonly retryable = false;
}
