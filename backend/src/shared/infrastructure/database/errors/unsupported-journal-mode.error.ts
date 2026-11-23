import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * SQLite could not keep a write-ahead log for the file, as on some network
 * file systems. Readers would then wait for every writer.
 */
export class UnsupportedJournalModeError extends InfrastructureError {
  public readonly code = 'unsupported_journal_mode';
  public readonly retryable = false;
}
