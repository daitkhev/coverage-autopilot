import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The engine answered and did not build the image a sandbox runs in, or
 * did not finish within the limit of a build. The end of what it said
 * tells why: a registry or a package it could not reach, a full disk, a
 * file it refused. A second run of the job at once meets the same cause
 * and spends minutes of the deadline on it, so it is not retried. The
 * next command in the image builds again, since a failure is not kept.
 */
export class SandboxImageBuildFailedError extends InfrastructureError {
  public readonly code = 'sandbox_image_build_failed';
  public readonly retryable = false;
}
