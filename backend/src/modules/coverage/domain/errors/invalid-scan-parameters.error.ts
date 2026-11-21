import { DomainError } from '#kernel/errors/domain.error';

/**
 * A project or a measurement described with an empty word, such as a
 * runner with no version. Numbers are compared by these words, so an
 * empty one would make two different measurements look the same.
 */
export class InvalidScanParametersError extends DomainError {
  public readonly code = 'invalid_scan_parameters';
  public readonly retryable = false;
}
