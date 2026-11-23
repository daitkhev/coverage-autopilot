import { DomainError } from '#kernel/errors/domain.error';

/**
 * A save of an improvement that changed since it was read, such as by a
 * cancel or an approval that came while a worker was busy. The same write
 * would fail again: the caller reads the improvement anew and decides on
 * what it finds.
 */
export class StaleImprovementError extends DomainError {
  public readonly code = 'stale_improvement';
  public readonly retryable = false;
}
