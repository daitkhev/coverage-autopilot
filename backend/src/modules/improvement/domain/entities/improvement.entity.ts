import type { Attempt } from '#improvement/domain/entities/attempt.entity';
import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import {
  type BaselineSnapshot,
  generationStarted,
  skipped,
  withBaselineSnapshot,
  withVerificationBaseline,
  workStarted,
} from '#improvement/domain/services/analysis.service';
import {
  acceptedOf,
  lastRejectedOf,
  openAttemptOf,
  requireOpenAttempt,
} from '#improvement/domain/services/attempt-list.service';
import {
  allowanceOf,
  type AttemptAllowance,
  usageOf,
} from '#improvement/domain/services/budget-use.service';
import {
  afterGeneration,
  failedAfterCall,
  resumed,
  type UnusableCall,
  withAttemptOpened,
} from '#improvement/domain/services/generation.service';
import {
  failed,
  moved,
} from '#improvement/domain/services/status-move.service';
import { checkedState } from '#improvement/domain/services/stored-state.service';
import {
  afterVerdict,
  approved,
  published,
} from '#improvement/domain/services/verdict.service';
import type { BranchName } from '#improvement/domain/value-objects/branch-name.vo';
import type { BudgetUsage } from '#improvement/domain/value-objects/budget-usage.vo';
import type { Generation } from '#improvement/domain/value-objects/generation.vo';
import type { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import type { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import type { ImprovementSkip } from '#improvement/domain/value-objects/improvement-skip.vo';
import {
  type ImprovementStatus,
  type ImprovementWait,
  waitOf,
} from '#improvement/domain/value-objects/improvement-status.vo';
import type { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';
import type { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import type { VerificationBaseline } from '#improvement/domain/value-objects/verification-baseline.vo';
import type { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import { Entity } from '#kernel/primitives/entity';
import type { Instant } from '#kernel/time/instant';

/**
 * The process of raising the coverage of one file, from the request to
 * the pull request. It holds the transitions of its status and its
 * invariants and nothing else: running the generator, the gate and `gh`
 * belongs to the application, which gives every moment as an argument.
 * Each method changes the improvement or throws a typed error.
 */
export class Improvement extends Entity<ImprovementId> {
  private current: ImprovementState;

  private constructor(state: ImprovementState) {
    super(state.id);
    this.current = Object.freeze(state);
  }

  /** A new improvement, not yet stored, whose work has not started. */
  public static create(
    id: ImprovementId,
    request: ImprovementRequest,
    at: Instant,
  ): Improvement {
    return new Improvement({
      id,
      request,
      status: 'created',
      phaseStartedAt: at,
      deadlineAt: null,
      resumesAt: null,
      limitWaits: 0,
      baselineSnapshotId: null,
      verificationBaseline: null,
      attempts: [],
      branch: null,
      pullRequest: null,
      failure: null,
      skip: null,
      createdAt: at,
      updatedAt: at,
      version: 1,
    });
  }

  /** An improvement as it was stored, which must hold every rule. */
  public static restore(state: ImprovementState): Improvement {
    return new Improvement(checkedState(state));
  }

  /** Everything it holds, for its store. */
  public get state(): ImprovementState {
    return this.current;
  }

  public get request(): ImprovementRequest {
    return this.current.request;
  }

  public get status(): ImprovementStatus {
    return this.current.status;
  }

  public get phaseStartedAt(): Instant {
    return this.current.phaseStartedAt;
  }

  public get deadlineAt(): Instant | null {
    return this.current.deadlineAt;
  }

  /**
   * The deadline of work that has started. Work starts with one and no
   * move takes it away, so only an improvement whose work never started
   * has none, and a step must not ask for it then.
   */
  public get workDeadline(): Instant {
    const { deadlineAt } = this.current;
    if (deadlineAt === null) {
      throw new InvalidTransitionError(
        `The improvement is ${this.status} and its work never started, so ` +
          'it has no deadline.',
      );
    }
    return deadlineAt;
  }

  public get resumesAt(): Instant | null {
    return this.current.resumesAt;
  }

  public get limitWaits(): number {
    return this.current.limitWaits;
  }

  public get baselineSnapshotId(): SnapshotId | null {
    return this.current.baselineSnapshotId;
  }

  public get verificationBaseline(): VerificationBaseline | null {
    return this.current.verificationBaseline;
  }

  public get attempts(): readonly Attempt[] {
    return this.current.attempts;
  }

  public get branch(): BranchName | null {
    return this.current.branch;
  }

  public get pullRequest(): PullRequestRef | null {
    return this.current.pullRequest;
  }

  public get failure(): ImprovementFailure | null {
    return this.current.failure;
  }

  public get skip(): ImprovementSkip | null {
    return this.current.skip;
  }

  public get createdAt(): Instant {
    return this.current.createdAt;
  }

  public get updatedAt(): Instant {
    return this.current.updatedAt;
  }

  public get version(): number {
    return this.current.version;
  }

  /** A cancel is the last move, so its moment is where the phase began. */
  public get cancelledAt(): Instant | null {
    return this.status === 'cancelled' ? this.phaseStartedAt : null;
  }

  /**
   * A person or a window, when it waits for one. Whether a worker or the
   * repository is needed is known to the job, not to the improvement.
   */
  public get waitingFor(): ImprovementWait | null {
    return waitOf(this.status);
  }

  public get currentAttempt(): Attempt | null {
    return openAttemptOf(this.attempts);
  }

  /** The feedback for the next attempt: what the gate last rejected. */
  public get lastRejectedAttempt(): Attempt | null {
    return lastRejectedOf(this.attempts);
  }

  /** The attempt whose patch is published, once the gate accepted one. */
  public get acceptedAttempt(): Attempt | null {
    return acceptedOf(this.attempts);
  }

  public usage(at: Instant): BudgetUsage {
    return usageOf(this.current, at);
  }

  public attemptAllowance(at: Instant): AttemptAllowance {
    return allowanceOf(this.current, at);
  }

  public startWork(at: Instant): void {
    this.change(workStarted(this.current, at));
  }

  public recordBaselineSnapshot(snapshot: BaselineSnapshot, at: Instant): void {
    this.change(withBaselineSnapshot(this.current, snapshot, at));
  }

  public recordVerificationBaseline(
    baseline: VerificationBaseline,
    at: Instant,
  ): void {
    this.change(withVerificationBaseline(this.current, baseline, at));
  }

  public startGenerating(at: Instant): void {
    this.change(generationStarted(this.current, at));
  }

  public skipWith(skip: ImprovementSkip, at: Instant): void {
    this.change(skipped(this.current, skip, at));
  }

  /** The attempt to generate with: the open one, or a new one. */
  public openAttempt(at: Instant): Attempt {
    this.change(withAttemptOpened(this.current, at));
    return requireOpenAttempt(this.attempts);
  }

  public recordGeneration(generation: Generation, at: Instant): void {
    this.change(afterGeneration(this.current, generation, at));
  }

  /** Keeps what a call spent and fails, as its output must not be used. */
  public failAfterCall(unusable: UnusableCall, at: Instant): void {
    this.change(failedAfterCall(this.current, unusable, at));
  }

  public resume(at: Instant): void {
    this.change(resumed(this.current, at));
  }

  public recordVerdict(report: VerificationReport, at: Instant): void {
    this.change(afterVerdict(this.current, report, at));
  }

  public approve(patchHash: string, at: Instant): void {
    this.change(approved(this.current, patchHash, at));
  }

  public recordPullRequest(pullRequest: PullRequestRef, at: Instant): void {
    this.change(published(this.current, pullRequest, at));
  }

  public fail(failure: ImprovementFailure, at: Instant): void {
    this.change(failed(this.current, failure, at));
  }

  public cancel(at: Instant): void {
    this.change(moved(this.current, 'cancelled', at));
  }

  private change(state: ImprovementState): void {
    this.current = Object.freeze(state);
  }
}
