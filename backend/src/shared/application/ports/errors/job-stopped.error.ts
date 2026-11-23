import { ApplicationError } from '#kernel/errors/application.error';

/**
 * Why the signal of a running job was aborted. The worker sets every
 * reason but `deadline_exceeded`, which a handler sets on a signal of its
 * own, because only the object of the job knows its deadline.
 */
export type JobStopReason =
  'user_cancelled' | 'deadline_exceeded' | 'worker_shutdown' | 'lease_lost';

const MESSAGES: Readonly<Record<JobStopReason, string>> = {
  user_cancelled: 'The user cancelled the job.',
  deadline_exceeded: 'The deadline of the job has passed.',
  worker_shutdown: 'The worker is stopping, and the job will run again.',
  lease_lost: 'Another worker may hold the job now, so this one saves nothing.',
};

/**
 * The reason a job signal is aborted with. An operation that stops on the
 * signal can throw it as it is, with `signal.throwIfAborted()`.
 */
export class JobStoppedError extends ApplicationError {
  public readonly code = 'job_stopped';
  public readonly retryable = false;
  public readonly reason: JobStopReason;

  public constructor(reason: JobStopReason) {
    super(MESSAGES[reason]);
    this.reason = reason;
  }

  /** The reason of an aborted job signal, or null for a signal that runs. */
  public static reasonOf(signal: AbortSignal): JobStopReason | null {
    const reason: unknown = signal.reason;
    return reason instanceof JobStoppedError ? reason.reason : null;
  }
}
