import { DomainError } from '#kernel/errors/domain.error';

/** A snapshot with no origin, or with a file in more than one state. */
export class InvalidCoverageSnapshotError extends DomainError {
  public readonly code = 'invalid_coverage_snapshot';
  public readonly retryable = false;
}
