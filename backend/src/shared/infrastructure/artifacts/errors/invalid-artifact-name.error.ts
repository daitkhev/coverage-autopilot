import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * An owner or a label that could name a file outside the store, or a
 * second spelling of one inside it. It is a mistake of the caller, so a
 * second try fails the same way.
 */
export class InvalidArtifactNameError extends InfrastructureError {
  public readonly code = 'invalid_artifact_name';
  public readonly retryable = false;
}
