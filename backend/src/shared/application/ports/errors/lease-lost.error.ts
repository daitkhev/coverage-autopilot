import { ApplicationError } from '#kernel/errors/application.error';

/**
 * A save through `JobContext.commit` found that the job is no longer
 * leased with the token of the context: another worker claimed it, or the
 * user cancelled it. Nothing was saved. A handler lets it pass, so the
 * worker can tell it from a fault of the work.
 */
export class LeaseLostError extends ApplicationError {
  public readonly code = 'lease_lost';
  public readonly retryable = false;
}
