import type { Transaction } from '#kernel/transaction/transaction';
import type {
  JobDocument,
  JobId,
  JobKind,
  JobProgress,
} from '#ports/job-queue.port';

/** A number that grows with every claim of a job. */
type LeaseToken = number;

/** What a handler returns to the worker, stored with the completed job. */
export type JobOutcome = JobDocument;

/** Why a handler asked to run the same step again. */
export interface RetryReason {
  readonly code: string;
  readonly message: string;
}

export interface JobContext {
  readonly jobId: JobId;
  readonly subjectId: string;
  readonly payload: JobDocument;
  readonly leaseToken: LeaseToken;
  /**
   * Aborted when the user cancels, the deadline passes, the worker stops
   * or the lease is lost. The reason says which.
   */
  readonly signal: AbortSignal;
  /**
   * Saves through one write transaction that first checks that the job is
   * still leased with this token. A worker that lost its lease saves
   * nothing: the call raises an error and the operation does not run.
   */
  commit<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T>;
  /** Returns at once and never fails. The worker writes the latest value. */
  reportProgress(progress: JobProgress): void;
}

/** A job whose runs are spent, already moved to `dead`. */
export interface DeadJobContext {
  readonly jobId: JobId;
  readonly subjectId: string;
  readonly payload: JobDocument;
  readonly runs: number;
}

export interface JobFinished {
  readonly status: 'finished';
  readonly outcome: JobOutcome;
}

/** A technical retry of the same step, counted by the queue. */
export interface JobRetry {
  readonly status: 'retry';
  readonly reason: RetryReason;
}

export type JobResult = JobFinished | JobRetry;

/**
 * Runs the jobs of one kind. Every handler can be run again on the same
 * job, because a crash between its last save and the completion of the
 * job makes the next run find the work already done.
 */
export interface JobHandler {
  readonly kind: JobKind;
  execute(context: JobContext): Promise<JobResult>;
  /** Moves the object of the job to its failed state, unless it is final. */
  onRetriesExhausted(context: DeadJobContext): Promise<void>;
}

/** The injection token of the list of every job handler. */
export const JOB_HANDLERS = Symbol('JobHandlers');
