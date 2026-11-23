import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A reference the store never gives out. Only `save` makes references, so
 * one of another shape is damaged data, and it is never opened as a path.
 */
export class InvalidArtifactReferenceError extends InfrastructureError {
  public readonly code = 'invalid_artifact_reference';
  public readonly retryable = false;
}
