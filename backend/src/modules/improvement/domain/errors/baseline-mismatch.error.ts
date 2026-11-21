import { DomainError } from '#kernel/errors/domain.error';

/**
 * A snapshot or a baseline of the gate that names another commit or
 * another file than the improvement: what is measured must be the commit
 * the patch is made on.
 */
export class BaselineMismatchError extends DomainError {
  public readonly code = 'baseline_mismatch';
  public readonly retryable = false;
}
