import type { AttemptDto } from '#improvement/application/dto/attempt.dto';
import type { BudgetLimits } from '#improvement/domain/value-objects/budget.vo';
import type { GeneratorConfigProps } from '#improvement/domain/value-objects/generator-config.vo';
import type { FailureReason } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementMode } from '#improvement/domain/value-objects/improvement-mode.vo';
import type { SkipReason } from '#improvement/domain/value-objects/improvement-skip.vo';
import type {
  ImprovementStatus,
  ImprovementWait,
} from '#improvement/domain/value-objects/improvement-status.vo';
import type { QualityPolicyProps } from '#improvement/domain/value-objects/quality-policy.vo';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';
import type { JobProgress, JobWait } from '#ports/job-queue.port';

/** No limit of tokens is `null`: a subscription has windows instead. */
export type BudgetDto = BudgetLimits;

/** What has been spent: every attempt opened, and seconds of work. */
export interface BudgetUsageDto {
  readonly attempts: number;
  readonly tokens: number;
  readonly seconds: number;
}

/**
 * Who has to act next. A person or a window, as the improvement knows
 * it, or a worker or the repository, as its job knows it.
 */
export type WaitingFor = ImprovementWait | Exclude<JobWait, 'moment'>;

/**
 * The steps of the running phase and when they were last written, so a
 * stalled worker shows. The client never sees the job behind them.
 */
export interface ProgressDto extends JobProgress {
  readonly updatedAt: Instant;
}

/** A stable code for scripts and a sentence for people. */
export interface ReasonDto<Reason> {
  readonly reason: Reason;
  readonly message: string;
}

/** The pull request an improvement opened. */
export interface PullRequestDto {
  readonly number: number;
  readonly url: string;
}

/** An improvement as a person sees it, with what its job adds. */
export interface ImprovementDto {
  readonly id: string;
  readonly repositoryId: RepositoryId;
  readonly sourceSnapshotId: string;
  readonly baselineSnapshotId: string | null;
  readonly baseCommit: CommitSha;
  readonly targetFile: FilePath;
  readonly status: ImprovementStatus;
  readonly mode: ImprovementMode;
  readonly waitingFor: WaitingFor | null;
  readonly phaseStartedAt: Instant;
  readonly budget: BudgetDto;
  readonly usage: BudgetUsageDto;
  readonly deadlineAt: Instant | null;
  /** When the window of the subscription opens. Set only while it waits. */
  readonly resumesAt: Instant | null;
  readonly limitWaits: number;
  readonly qualityPolicy: QualityPolicyProps;
  readonly generator: GeneratorConfigProps;
  readonly attempts: readonly AttemptDto[];
  /** `null` when no worker runs the improvement now. */
  readonly progress: ProgressDto | null;
  readonly branch: string | null;
  readonly pullRequest: PullRequestDto | null;
  readonly failure: ReasonDto<FailureReason> | null;
  readonly skip: ReasonDto<SkipReason> | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly cancelledAt: Instant | null;
}
