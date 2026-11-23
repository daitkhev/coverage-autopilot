import { DomainError } from '#kernel/errors/domain.error';

/** A text that is not the full hash of a commit. */
export class InvalidCommitShaError extends DomainError {
  public readonly code = 'invalid_commit_sha';
  public readonly retryable = false;
}
