import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The engine has no image of the name a sandbox runs in, and did not pull
 * it, or did not finish within the limit of a pull. The end of what it
 * said tells why: a name that exists nowhere, a registry that refuses or
 * cannot be reached. The setting or the registry has to change first, so
 * a second run of the job at once fails the same way. The next command in
 * the image pulls again, since a failure is not kept.
 */
export class SandboxImagePullFailedError extends InfrastructureError {
  public readonly code = 'sandbox_image_pull_failed';
  public readonly retryable = false;
}
