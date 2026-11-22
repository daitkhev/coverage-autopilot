import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The file the service builds the image of a sandbox from cannot be read.
 * The package of the service ships it, so the package is incomplete, and
 * only a person who installs it again mends that.
 */
export class SandboxImageFileMissingError extends InfrastructureError {
  public readonly code = 'sandbox_image_file_missing';
  public readonly retryable = false;
}
