import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * Two handlers were given for one kind of job. The worker would run one
 * of them and drop the other without a word, so the start stops instead.
 */
export class DuplicateJobHandlerError extends InfrastructureError {
  public readonly code = 'duplicate_job_handler';
  public readonly retryable = false;
}
