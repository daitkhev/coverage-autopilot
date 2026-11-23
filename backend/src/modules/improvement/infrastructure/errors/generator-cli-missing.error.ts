import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The generator sandbox found no program to start by the name of the CLI:
 * the image has none, or not on the `PATH` it was given. Running again
 * helps only after the image is fixed.
 */
export class GeneratorCliMissingError extends InfrastructureError {
  public readonly code = 'generator_cli_missing';
  public readonly retryable = false;
}
