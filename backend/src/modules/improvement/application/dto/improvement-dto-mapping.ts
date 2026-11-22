import {
  attemptDtoOf,
  type OutputPathOf,
} from '#improvement/application/dto/attempt-dto-mapping';
import type {
  BudgetDto,
  BudgetUsageDto,
  ImprovementDto,
  ProgressDto,
  PullRequestDto,
  ReasonDto,
  WaitingFor,
} from '#improvement/application/dto/improvement.dto';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { Budget } from '#improvement/domain/value-objects/budget.vo';
import type { BudgetUsage } from '#improvement/domain/value-objects/budget-usage.vo';
import type { GeneratorConfig } from '#improvement/domain/value-objects/generator-config.vo';
import type { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';
import type { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';

/**
 * What the stored improvement does not hold: what it has spent until now,
 * and what its job is doing or waits for.
 */
export interface LiveFacts {
  readonly usage: BudgetUsage;
  readonly progress: ProgressDto | null;
  readonly waitingFor: WaitingFor | null;
}

/** The three limits of a budget as plain numbers. */
export function budgetDtoOf(budget: Budget): BudgetDto {
  return {
    attempts: budget.attempts,
    tokens: budget.tokens,
    minutes: budget.minutes,
  };
}

function usageDtoOf(usage: BudgetUsage): BudgetUsageDto {
  return {
    attempts: usage.attempts,
    tokens: usage.tokens,
    seconds: usage.seconds,
  };
}

function policyDtoOf(policy: QualityPolicy): ImprovementDto['qualityPolicy'] {
  return {
    requiredChecks: [...policy.requiredChecks],
    repeatedRuns: policy.repeatedRuns,
    mutationThreshold: policy.mutationThreshold,
  };
}

function generatorDtoOf(
  generator: GeneratorConfig,
): ImprovementDto['generator'] {
  return {
    cli: generator.cli,
    model: generator.model,
    promptVersion: generator.promptVersion,
    billing: generator.billing,
  };
}

function pullRequestDtoOf(
  pullRequest: PullRequestRef | null,
): PullRequestDto | null {
  return pullRequest === null
    ? null
    : { number: pullRequest.number, url: pullRequest.url };
}

/** A failure or a skip: its code and its sentence. */
function reasonDtoOf<Reason>(
  ending: ReasonDto<Reason> | null,
): ReasonDto<Reason> | null {
  return ending === null
    ? null
    : { reason: ending.reason, message: ending.message };
}

/**
 * The stored improvement with its live facts and the paths of its raw
 * output: values only.
 */
export function improvementDtoOf(
  improvement: Improvement,
  live: LiveFacts,
  outputPathOf: OutputPathOf,
): ImprovementDto {
  const { request } = improvement;
  return {
    id: improvement.id.value,
    repositoryId: request.repositoryId,
    sourceSnapshotId: request.sourceSnapshotId.value,
    baselineSnapshotId: improvement.baselineSnapshotId?.value ?? null,
    baseCommit: request.baseCommit,
    targetFile: request.targetFile,
    status: improvement.status,
    mode: request.mode,
    waitingFor: live.waitingFor,
    phaseStartedAt: improvement.phaseStartedAt,
    budget: budgetDtoOf(request.budget),
    usage: usageDtoOf(live.usage),
    deadlineAt: improvement.deadlineAt,
    resumesAt: improvement.resumesAt,
    limitWaits: improvement.limitWaits,
    qualityPolicy: policyDtoOf(request.policy),
    generator: generatorDtoOf(request.generator),
    attempts: improvement.attempts.map((attempt) =>
      attemptDtoOf(attempt, outputPathOf),
    ),
    progress: live.progress,
    branch: improvement.branch?.value ?? null,
    pullRequest: pullRequestDtoOf(improvement.pullRequest),
    failure: reasonDtoOf(improvement.failure),
    skip: reasonDtoOf(improvement.skip),
    createdAt: improvement.createdAt,
    updatedAt: improvement.updatedAt,
    cancelledAt: improvement.cancelledAt,
  };
}
