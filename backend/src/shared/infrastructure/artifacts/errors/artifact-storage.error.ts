import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The file system refused a write or a read, as a full disk does. Such a
 * state can clear, so a second try may work.
 */
export class ArtifactStorageError extends InfrastructureError {
  public readonly code = 'artifact_storage_failed';
  public readonly retryable = true;
}
