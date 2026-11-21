import { Inject, Injectable } from '@nestjs/common';

import {
  type ClaimedRow,
  claimJob,
  type ClaimRequest,
  takeSpentJob,
} from '#infrastructure/database/sqlite-job-leases';
import { InvalidStoredJobError } from '#infrastructure/queue/errors/invalid-stored-job.error';
import { JobLease, type LeaseTools } from '#infrastructure/queue/job-lease';
import { JobWorkerLog } from '#infrastructure/queue/job-worker-log';
import {
  JOB_WORKER_SETTINGS,
  type JobWorkerSettings,
} from '#infrastructure/queue/job-worker-settings';
import { jobDocumentOf } from '#infrastructure/queue/stored-job-documents';
import { ApplicationError } from '#kernel/errors/application.error';
import { DomainError } from '#kernel/errors/domain.error';
import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { JobStopReason } from '#ports/errors/job-stopped.error';
import {
  JOB_HANDLERS,
  type JobHandler,
  type JobOutcome,
  type JobResult,
} from '#ports/job-handler.port';
import type { JobId } from '#ports/job-queue.port';
import { LOGGER, type Logger } from '#ports/logger.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';

/** A job a claim took, and whether its runs are spent. */
interface Claim {
  readonly row: ClaimedRow;
  readonly spent: boolean;
}

interface RunningJob {
  readonly lease: JobLease;
  readonly serializationKey: string;
  /** Settles once the last write of the job is done. Never rejects. */
  readonly done: Promise<void>;
}

/** What `execute` left: a result, or what it threw. */
type Settled = { readonly result: JobResult } | { readonly error: unknown };

/** What the worker writes once the handler is done. */
type Ending =
  | { readonly step: 'complete'; readonly outcome: JobOutcome }
  | { readonly step: 'retry' | 'bury' | 'release' | 'none' };

async function settle(handler: JobHandler, lease: JobLease): Promise<Settled> {
  try {
    return { result: await handler.execute(lease) };
  } catch (error) {
    return { error };
  }
}

function isRetryable(error: unknown): boolean {
  return (
    (error instanceof DomainError ||
      error instanceof ApplicationError ||
      error instanceof InfrastructureError) &&
    error.retryable
  );
}

/**
 * A finished result is saved even after the worker stopped the job: the
 * work is done, and the token check refuses it if the lease is gone. An
 * error of none of the three typed kinds is a fault that nobody foresaw.
 * A run again would repeat it, so it is not retried: the job is dead.
 */
function endingOf(settled: Settled, stopReason: JobStopReason | null): Ending {
  if ('result' in settled && settled.result.status === 'finished') {
    return { step: 'complete', outcome: settled.result.outcome };
  }
  if (stopReason === 'worker_shutdown') {
    return { step: 'release' };
  }
  if (stopReason !== null) {
    return { step: 'none' };
  }
  if ('result' in settled || isRetryable(settled.error)) {
    return { step: 'retry' };
  }
  return { step: 'bury' };
}

/**
 * Runs the jobs of the queue: several at once, never two of one
 * repository. It owns the lease, the heartbeat, the count of runs and the
 * completion of a job. Each method is one step that a timer or a test
 * calls, and none of them rejects: a write the database refuses leaves
 * the job leased, and a job whose lease ran out is claimed again.
 */
@Injectable()
export class JobWorker {
  private readonly transactions: TransactionManager;
  private readonly clock: Clock;
  private readonly settings: JobWorkerSettings;
  private readonly handlers: ReadonlyMap<string, JobHandler>;
  private readonly tools: LeaseTools;
  private readonly log: JobWorkerLog;
  private readonly running = new Map<JobId, RunningJob>();
  private polling: Promise<void> | undefined;
  private stopping = false;

  public constructor(
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(CLOCK) clock: Clock,
    @Inject(JOB_HANDLERS) handlers: readonly JobHandler[],
    @Inject(JOB_WORKER_SETTINGS) settings: JobWorkerSettings,
    @Inject(LOGGER) logger: Logger,
  ) {
    this.transactions = transactions;
    this.clock = clock;
    this.settings = settings;
    this.handlers = new Map(handlers.map((handler) => [handler.kind, handler]));
    this.tools = { transactions, clock, leaseMs: settings.leaseMs };
    this.log = new JobWorkerLog(logger);
  }

  /**
   * Claims jobs until every place is taken or no job is free, and starts
   * each. A poll that comes while another one claims joins it.
   */
  public async poll(): Promise<void> {
    this.polling ??= this.fill().finally(() => {
      this.polling = undefined;
    });
    await this.polling;
  }

  /** Extends the lease of every running job. */
  public async heartbeat(): Promise<void> {
    await Promise.allSettled(this.leases().map((lease) => lease.extend()));
  }

  /** Writes the progress each running job reported since its last write. */
  public async writeProgress(): Promise<void> {
    await Promise.allSettled(
      this.leases().map((lease) => lease.writeProgress()),
    );
  }

  /**
   * Claims nothing more, aborts every running job with `worker_shutdown`
   * and waits until each handler has returned and its job is written.
   */
  public async stop(): Promise<void> {
    this.stopping = true;
    await this.polling;
    for (const lease of this.leases()) {
      lease.stop('worker_shutdown');
    }
    await this.whenIdle();
  }

  /** Settles once every job this worker runs now has ended. */
  public async whenIdle(): Promise<void> {
    await Promise.all([...this.running.values()].map((run) => run.done));
  }

  private async fill(): Promise<void> {
    try {
      while (!this.stopping && this.running.size < this.settings.jobsAtOnce) {
        const claim = await this.claim();
        if (claim === undefined) {
          return;
        }
        this.start(claim);
      }
    } catch (error) {
      // The database refused the claim, or a claimed row could not be
      // read. The next poll claims again, and a job left leased is
      // claimed again once its lease runs out.
      this.log.claimRefused(error);
    }
  }

  /** A job whose runs are spent is buried before a job is claimed to run. */
  private async claim(): Promise<Claim | undefined> {
    return this.transactions.run(async (transaction) => {
      const request = this.claimRequest();
      const spent = takeSpentJob(transaction, request);
      if (spent !== undefined) {
        return Promise.resolve({ row: spent, spent: true });
      }
      const row = claimJob(transaction, request);
      return Promise.resolve(
        row === undefined ? undefined : { row, spent: false },
      );
    });
  }

  private claimRequest(): ClaimRequest {
    const now = this.clock.now();
    const busy = [...this.running.values()].map((run) => run.serializationKey);
    return {
      now: now.toString(),
      leaseExpiresAt: now.plusMilliseconds(this.settings.leaseMs).toString(),
      maxRuns: this.settings.maxRuns,
      kinds: JSON.stringify([...this.handlers.keys()]),
      busy: JSON.stringify(busy),
    };
  }

  private start(claim: Claim): void {
    const { row } = claim;
    const handler = this.handlerOf(row);
    const payload = jobDocumentOf(row.payload);
    const lease = new JobLease({ ...row, payload }, this.tools);
    const work = claim.spent
      ? this.bury(lease, handler)
      : this.run(row, { lease, handler });
    this.running.set(row.id, {
      lease,
      serializationKey: row.serializationKey,
      done: this.untilEnd(row, work),
    });
  }

  /** A claim takes only the kinds this worker has a handler for. */
  private handlerOf(row: ClaimedRow): JobHandler {
    const handler = this.handlers.get(row.kind);
    if (handler === undefined) {
      throw new InvalidStoredJobError(
        `Job ${row.id} is of the kind "${row.kind}", which no handler of ` +
          'this worker runs.',
      );
    }
    return handler;
  }

  private async untilEnd(row: ClaimedRow, work: Promise<void>): Promise<void> {
    try {
      await work;
    } catch (error) {
      // A write the database refused, or a handler that failed to hear
      // that the runs are spent. The lease runs out and the job is claimed
      // again, which every handler allows.
      this.log.endNotWritten(row, error);
    } finally {
      this.running.delete(row.id);
    }
  }

  private async run(
    row: ClaimedRow,
    job: { readonly lease: JobLease; readonly handler: JobHandler },
  ): Promise<void> {
    this.log.started(row);
    const settled = await settle(job.handler, job.lease);
    if ('error' in settled && job.lease.stopReason === null) {
      this.log.failed(row, settled.error);
    }
    const ending = endingOf(settled, job.lease.stopReason);
    await this.end(job.lease, job.handler, ending);
    this.log.ended(row, ending.step);
  }

  private async end(
    lease: JobLease,
    handler: JobHandler,
    ending: Ending,
  ): Promise<void> {
    switch (ending.step) {
      case 'complete':
        return lease.complete(ending.outcome);
      case 'release':
        return lease.release();
      case 'retry':
        return lease.runs < this.settings.maxRuns
          ? lease.retry()
          : this.bury(lease, handler);
      case 'bury':
        return this.bury(lease, handler);
      case 'none':
        return Promise.resolve();
    }
  }

  /**
   * The handler hears it first and the job is dead after, so a crash in
   * between makes the next worker tell the handler again, which it allows.
   */
  private async bury(lease: JobLease, handler: JobHandler): Promise<void> {
    await handler.onRetriesExhausted(lease.deadContext());
    await lease.bury();
  }

  private leases(): JobLease[] {
    return [...this.running.values()].map((run) => run.lease);
  }
}
