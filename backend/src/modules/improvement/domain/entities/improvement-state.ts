import type { Attempt } from '#improvement/domain/entities/attempt.entity';
import type { BranchName } from '#improvement/domain/value-objects/branch-name.vo';
import type { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import type { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import type { ImprovementSkip } from '#improvement/domain/value-objects/improvement-skip.vo';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';
import type { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';
import type { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import type { VerificationBaseline } from '#improvement/domain/value-objects/verification-baseline.vo';
import type { Instant } from '#kernel/time/instant';

/**
 * Everything an improvement holds, as its store keeps it. The rules that
 * change it are the domain services, and only the aggregate calls them.
 */
export interface ImprovementState {
  readonly id: ImprovementId;
  readonly request: ImprovementRequest;
  readonly status: ImprovementStatus;
  /** When the current status began, or the current attempt opened. */
  readonly phaseStartedAt: Instant;
  /** Set when work starts. Every wait moves it later by its length. */
  readonly deadlineAt: Instant | null;
  /** When the window of the subscription opens. Set only while it waits. */
  readonly resumesAt: Instant | null;
  /** How many times the improvement waited for a window. */
  readonly limitWaits: number;
  /** The fresh snapshot of `analyzing`, at the base commit. */
  readonly baselineSnapshotId: SnapshotId | null;
  readonly verificationBaseline: VerificationBaseline | null;
  /** In the order of their numbers. Only the last one may be open. */
  readonly attempts: readonly Attempt[];
  /** Set when publishing starts. */
  readonly branch: BranchName | null;
  readonly pullRequest: PullRequestRef | null;
  readonly failure: ImprovementFailure | null;
  readonly skip: ImprovementSkip | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  /** The version of the stored row, which every save checks and raises. */
  readonly version: number;
}
