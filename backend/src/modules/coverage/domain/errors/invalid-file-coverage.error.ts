import { DomainError } from '#kernel/errors/domain.error';

/** A measured file with nothing to count, which proves nothing. */
export class InvalidFileCoverageError extends DomainError {
  public readonly code = 'invalid_file_coverage';
  public readonly retryable = false;
}
