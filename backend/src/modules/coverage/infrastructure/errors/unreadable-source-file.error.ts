import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A source file of the list could not be read as a plain file: it is
 * gone, or something else stands in its place. The same working copy
 * gives the same answer, so it is not retried.
 */
export class UnreadableSourceFileError extends InfrastructureError {
  public readonly code = 'unreadable_source_file';
  public readonly retryable = false;
}
