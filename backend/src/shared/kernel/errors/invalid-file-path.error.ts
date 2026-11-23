import { DomainError } from '#kernel/errors/domain.error';

/** A text that is not a path as git stores it. */
export class InvalidFilePathError extends DomainError {
  public readonly code = 'invalid_file_path';
  public readonly retryable = false;
}
