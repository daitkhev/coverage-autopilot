import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The sandbox kept only the end of the output, and the start report of
 * the CLI was in the part it dropped. Without it the tools of the run are
 * unknown. The limit of output of the generator sandbox is too small for
 * the run, so running again with the same limit does not help.
 */
export class GeneratorOutputTruncatedError extends InfrastructureError {
  public readonly code = 'generator_output_truncated';
  public readonly retryable = false;
}
