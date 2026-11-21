import {
  buryJob,
  completeJob,
  extendLease,
  type HeldLease,
  releaseJob,
  retryJob,
  saveProgress,
  storedLeaseOf,
} from '#infrastructure/database/sqlite-job-leases';
import { progressDocumentOf } from '#infrastructure/queue/stored-job-documents';
import type { Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';
import {
  JobStoppedError,
  type JobStopReason,
} from '#ports/errors/job-stopped.error';
import { LeaseLostError } from '#ports/errors/lease-lost.error';
import type {
  DeadJobContext,
  JobContext,
  JobOutcome,
} from '#ports/job-handler.port';
import type { JobDocument, JobId, JobProgress } from '#ports/job-queue.port';
import type { TransactionManager } from '#ports/transaction-manager.port';

/** A job a claim gave this worker, with its payload read. */
export interface LeasedJob {
  readonly id: JobId;
  readonly subjectId: string;
  readonly payload: JobDocument;
  /** The runs so far, the one of this claim included. */
  readonly runs: number;
  readonly leaseToken: number;
}

/** What every lease of one worker shares. */
export interface LeaseTools {
  readonly transactions: TransactionManager;
  readonly clock: Clock;
  readonly leaseMs: number;
}

/** Progress is a hint for people, so a job writes it at most this often. */
export const PROGRESS_INTERVAL_MS = 1_000;

type Statement = (transaction: Transaction, now: Instant) => void;

/**
 * One claim of a job by this worker, and the context its handler gets.
 * Every write first checks, in the same write transaction, that the job
 * is still leased with this token. It compares the token and the status,
 * never the clock, so an expired lease that nobody claimed still saves. A
 * write that finds the lease gone aborts the signal, and the lease writes
 * nothing after it.
 */
export class JobLease implements JobContext {
  public readonly jobId: JobId;
  public readonly subjectId: string;
  public readonly payload: JobDocument;
  public readonly leaseToken: number;
  public readonly runs: number;
  private readonly tools: LeaseTools;
  private readonly controller = new AbortController();
  private unwritten: JobProgress | undefined;
  private progressWrittenAt: Instant | undefined;
  private lost = false;

  public constructor(job: LeasedJob, tools: LeaseTools) {
    this.jobId = job.id;
    this.subjectId = job.subjectId;
    this.payload = job.payload;
    this.leaseToken = job.leaseToken;
    this.runs = job.runs;
    this.tools = tools;
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** The reason the worker stopped the job for, or null while it runs. */
  public get stopReason(): JobStopReason | null {
    return JobStoppedError.reasonOf(this.signal);
  }

  public async commit<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.tools.transactions.run(async (transaction) => {
      if (!this.holds(transaction)) {
        throw new LeaseLostError(
          `Job ${this.jobId} is no longer leased with token ` +
            `${String(this.leaseToken)}, so nothing was saved.`,
        );
      }
      return operation(transaction);
    });
  }

  public reportProgress(progress: JobProgress): void {
    this.unwritten = progress;
  }

  /** The heartbeat. */
  public async extend(): Promise<void> {
    await this.write((transaction, now) => {
      extendLease(transaction, this.held(), {
        leaseExpiresAt: now.plusMilliseconds(this.tools.leaseMs).toString(),
        now: now.toString(),
      });
    });
  }

  /**
   * Writes the latest report, unless the last write is less than a
   * second old. A failed write is not tried again: the next report
   * carries the whole list of steps.
   */
  public async writeProgress(): Promise<void> {
    const progress = this.unwritten;
    const now = this.tools.clock.now();
    if (progress === undefined || !this.progressDue(now)) {
      return;
    }
    this.unwritten = undefined;
    this.progressWrittenAt = now;
    await this.write((transaction) => {
      saveProgress(transaction, this.held(), {
        progress: progressDocumentOf(progress),
        now: now.toString(),
      });
    });
  }

  public async complete(outcome: JobOutcome): Promise<void> {
    await this.write((transaction, now) => {
      completeJob(transaction, this.held(), {
        outcome: JSON.stringify(outcome),
        now: now.toString(),
      });
    });
  }

  /** Back to the queue. The run stays counted. */
  public async retry(): Promise<void> {
    await this.write((transaction, now) => {
      retryJob(transaction, this.held(), now.toString());
    });
  }

  /** Back to the queue, with the run given back: the job did not fail. */
  public async release(): Promise<void> {
    await this.write((transaction, now) => {
      releaseJob(transaction, this.held(), now.toString());
    });
  }

  public async bury(): Promise<void> {
    await this.write((transaction, now) => {
      buryJob(transaction, this.held(), now.toString());
    });
  }

  /** A signal keeps the first reason it was aborted with. */
  public stop(reason: JobStopReason): void {
    this.controller.abort(new JobStoppedError(reason));
  }

  public deadContext(): DeadJobContext {
    return {
      jobId: this.jobId,
      subjectId: this.subjectId,
      payload: this.payload,
      runs: this.runs,
    };
  }

  private held(): HeldLease {
    return { id: this.jobId, leaseToken: this.leaseToken };
  }

  private progressDue(now: Instant): boolean {
    const last = this.progressWrittenAt;
    return (
      last === undefined ||
      !now.isBefore(last.plusMilliseconds(PROGRESS_INTERVAL_MS))
    );
  }

  private async write(statement: Statement): Promise<void> {
    if (this.lost) {
      return;
    }
    await this.tools.transactions.run(async (transaction) => {
      if (this.holds(transaction)) {
        statement(transaction, this.tools.clock.now());
      }
      return Promise.resolve();
    });
  }

  /** A cancel keeps the token of the job, so the status tells the reason. */
  private holds(transaction: Transaction): boolean {
    const stored = storedLeaseOf(transaction, this.jobId);
    if (stored?.status === 'leased' && stored.leaseToken === this.leaseToken) {
      return true;
    }
    this.lost = true;
    this.stop(stored?.status === 'cancelled' ? 'user_cancelled' : 'lease_lost');
    return false;
  }
}
