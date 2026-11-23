import { DomainError } from '#kernel/errors/domain.error';

/**
 * An approval that names another patch than the accepted one: the person
 * saw a patch that is not the one that would be published.
 */
export class ApprovalMismatchError extends DomainError {
  public readonly code = 'approval_mismatch';
  public readonly retryable = false;
}
