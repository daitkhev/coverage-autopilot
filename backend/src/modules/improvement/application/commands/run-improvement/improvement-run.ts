import { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { ImprovementRepository } from '#improvement/domain/repositories/improvement.repository';
import type { Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';
import type { JobContext } from '#ports/job-handler.port';
import type { JobProgress } from '#ports/job-queue.port';

/** What a run takes from the handler that started it. */
export interface RunTools {
  readonly context: JobContext;
  /**
   * The signal of the job, which is also aborted with `deadline_exceeded`
   * when the deadline of the improvement passes.
   */
  readonly signal: AbortSignal;
  readonly improvements: ImprovementRepository;
  readonly clock: Clock;
}

/** A change of an improvement, at the moment the run gives it. */
type Change = (improvement: Improvement, at: Instant) => void;

/**
 * Statements that must be saved together with a change, or not at all.
 * They are given the improvement as the change left it, so a job that
 * follows from the new status is made from that status.
 */
type Also = (transaction: Transaction, saved: Improvement) => Promise<void>;

/**
 * One run of the job of an improvement, as its steps see it: the
 * improvement as it was last saved, the signal that stops the work, and
 * the one way to save. Aggregates know nothing about leases, so the guard
 * of the lease is applied here.
 */
export class ImprovementRun {
  private current: Improvement;
  private readonly tools: RunTools;

  public constructor(improvement: Improvement, tools: RunTools) {
    this.current = improvement;
    this.tools = tools;
  }

  /** The improvement as it was read, or as the last save left it. */
  public get improvement(): Improvement {
    return this.current;
  }

  public get signal(): AbortSignal {
    return this.tools.signal;
  }

  /** Whose work this is, for folders, raw output and lines of the log. */
  public get owner(): string {
    return `improvement:${this.current.id.value}`;
  }

  public now(): Instant {
    return this.tools.clock.now();
  }

  /** A hint for people. It returns at once and never fails. */
  public reportProgress(progress: JobProgress): void {
    this.tools.context.reportProgress(progress);
  }

  /**
   * Applies a change and saves it through the lease of the job, with
   * `also` in the same transaction. The change is made on a copy, so a
   * change the aggregate refuses or a save that fails leaves the run with
   * the improvement it had. A worker that lost its lease saves nothing,
   * and a version that moved is `stale_improvement`.
   */
  public async save(change: Change, also?: Also): Promise<void> {
    const next = Improvement.restore(this.current.state);
    change(next, this.now());
    this.current = await this.tools.context.commit(async (transaction) => {
      const saved = await this.tools.improvements.save(next, transaction);
      await also?.(transaction, saved);
      return saved;
    });
  }
}
