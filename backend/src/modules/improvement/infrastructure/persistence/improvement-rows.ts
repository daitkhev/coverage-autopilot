import type { Attempt } from '#improvement/domain/entities/attempt.entity';
import { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { BranchName } from '#improvement/domain/value-objects/branch-name.vo';
import { Budget } from '#improvement/domain/value-objects/budget.vo';
import { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import { ImprovementSkip } from '#improvement/domain/value-objects/improvement-skip.vo';
import { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';
import { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import {
  type Columns,
  instantOrNull,
  orNull,
  textOrNull,
} from '#improvement/infrastructure/persistence/attempt-rows';
import type { ImprovementRow } from '#improvement/infrastructure/persistence/improvement-documents.schema';
import {
  generatorConfigFrom,
  generatorConfigText,
  qualityPolicyFrom,
  qualityPolicyText,
  verificationBaselineFrom,
  verificationBaselineText,
} from '#improvement/infrastructure/persistence/stored-documents';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';

/** The table keeps the limit of time in milliseconds. */
const MS_PER_MINUTE = 60_000;

function requestColumns(request: ImprovementRequest): Columns {
  const { budget } = request;
  return {
    repository_id: request.repositoryId.value,
    source_snapshot_id: request.sourceSnapshotId.value,
    base_commit: request.baseCommit.value,
    target_file: request.targetFile.value,
    mode: request.mode,
    request_key: request.key.value,
    request_fingerprint: request.fingerprint.value,
    quality_policy: qualityPolicyText(request.policy),
    generator_config: generatorConfigText(request.generator),
    max_attempts: budget.attempts,
    max_tokens: budget.tokens,
    time_limit_ms: budget.minutes * MS_PER_MINUTE,
  };
}

function endingColumns(state: ImprovementState): Columns {
  const { failure, skip, pullRequest } = state;
  return {
    failure_reason: orNull(failure, (kept) => kept.reason),
    failure_message: orNull(failure, (kept) => kept.message),
    skip_reason: orNull(skip, (kept) => kept.reason),
    skip_message: orNull(skip, (kept) => kept.message),
    branch: orNull(state.branch, (kept) => kept.value),
    pull_request_number: orNull(pullRequest, (kept) => kept.number),
    pull_request_url: orNull(pullRequest, (kept) => kept.url),
  };
}

/** The row of an improvement, with the version it is to be stored as. */
export function improvementColumns(
  improvement: Improvement,
  version: number,
): Columns {
  const { state } = improvement;
  return {
    id: state.id.value,
    ...requestColumns(state.request),
    ...endingColumns(state),
    status: state.status,
    // The tokens spent do not depend on the moment the usage is taken at.
    tokens_used: improvement.usage(state.updatedAt).tokens,
    deadline_at: textOrNull(state.deadlineAt),
    resumes_at: textOrNull(state.resumesAt),
    limit_waits: state.limitWaits,
    baseline_snapshot_id: orNull(state.baselineSnapshotId, (id) => id.value),
    verification_baseline: orNull(
      state.verificationBaseline,
      verificationBaselineText,
    ),
    phase_started_at: state.phaseStartedAt.toString(),
    version,
    created_at: state.createdAt.toString(),
    updated_at: state.updatedAt.toString(),
  };
}

function requestFrom(row: ImprovementRow): ImprovementRequest {
  return ImprovementRequest.create({
    repositoryId: RepositoryId.create(row.repository_id),
    sourceSnapshotId: SnapshotId.create(row.source_snapshot_id),
    baseCommit: CommitSha.create(row.base_commit),
    targetFile: FilePath.create(row.target_file),
    mode: row.mode,
    key: RequestKey.create(row.request_key),
    fingerprint: RequestFingerprint.create(row.request_fingerprint),
    policy: qualityPolicyFrom(row.quality_policy),
    generator: generatorConfigFrom(row.generator_config),
    budget: Budget.create({
      attempts: row.max_attempts,
      tokens: row.max_tokens,
      minutes: row.time_limit_ms / MS_PER_MINUTE,
    }),
  });
}

/** A pair of columns the table keeps both or neither of. */
function both<First, Second, Value>(
  first: First | null,
  second: Second | null,
  make: (first: First, second: Second) => Value,
): Value | null {
  return first === null || second === null ? null : make(first, second);
}

type Endings = Pick<
  ImprovementState,
  'failure' | 'skip' | 'branch' | 'pullRequest'
>;

function endingsFrom(row: ImprovementRow, id: ImprovementId): Endings {
  return {
    failure: both(row.failure_reason, row.failure_message, (reason, message) =>
      ImprovementFailure.create({ reason, message }),
    ),
    skip: both(row.skip_reason, row.skip_message, (reason, message) =>
      ImprovementSkip.create({ reason, message }),
    ),
    branch: orNull(row.branch, (branch) => BranchName.parse(branch, id)),
    pullRequest: both(
      row.pull_request_number,
      row.pull_request_url,
      (number, url) => PullRequestRef.create({ number, url }),
    ),
  };
}

/** The improvement as it was saved, from its row and its attempts. */
export function improvementFrom(
  row: ImprovementRow,
  attempts: readonly Attempt[],
): Improvement {
  const id = ImprovementId.create(row.id);
  return Improvement.restore({
    id,
    request: requestFrom(row),
    status: row.status,
    phaseStartedAt: Instant.parse(row.phase_started_at),
    deadlineAt: instantOrNull(row.deadline_at),
    resumesAt: instantOrNull(row.resumes_at),
    limitWaits: row.limit_waits,
    baselineSnapshotId: orNull(row.baseline_snapshot_id, (snapshot) =>
      SnapshotId.create(snapshot),
    ),
    verificationBaseline: orNull(
      row.verification_baseline,
      verificationBaselineFrom,
    ),
    attempts,
    ...endingsFrom(row, id),
    createdAt: Instant.parse(row.created_at),
    updatedAt: Instant.parse(row.updated_at),
    version: row.version,
  });
}
