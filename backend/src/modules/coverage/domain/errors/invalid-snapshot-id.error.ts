import { DomainError } from '#kernel/errors/domain.error';

/** A text that is not the id of a snapshot as the id generator makes one. */
export class InvalidSnapshotIdError extends DomainError {
  public readonly code = 'invalid_snapshot_id';
  public readonly retryable = false;
}
