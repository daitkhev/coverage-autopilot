import type { AskedImprovement } from '#improvement/application/commands/start-improvement/requested-improvement';
import type {
  ConflictReason,
  StartRefusal,
} from '#improvement/application/commands/start-improvement/start-improvement.command';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { RevisionAssessmentDto } from '#repositories/contracts/repositories-public-api';

/** A value of the request breaks a rule, in the words of the rule. */
export function invalidRequest(message: string): StartRefusal {
  return { outcome: 'refused', reason: 'invalid_request', message };
}

/** The snapshot is not there, or was never stored. */
export function snapshotNotFound(asked: AskedImprovement): StartRefusal {
  return {
    outcome: 'refused',
    reason: 'snapshot_not_found',
    message: `No snapshot has the id ${asked.snapshotId.value}.`,
  };
}

/** A file with no numbers or no code can never be shown to be covered more. */
export function targetNotMeasured(asked: AskedImprovement): StartRefusal {
  return {
    outcome: 'refused',
    reason: 'target_not_measured',
    message:
      `${asked.targetFile.value} is not a measured file of the snapshot ` +
      `${asked.snapshotId.value}.`,
  };
}

/** A head that moved past a change of the file, or away from the commit. */
export function staleSnapshot(
  asked: AskedImprovement,
  commit: CommitSha,
  assessment: RevisionAssessmentDto['outcome'],
): StartRefusal {
  const message =
    assessment === 'diverged'
      ? `The commit ${commit.value} of the snapshot is not in the history ` +
        'of the default branch any more.'
      : `${asked.targetFile.value} changed on the default branch after the ` +
        `commit ${commit.value} of the snapshot.`;
  return { outcome: 'refused', reason: 'stale_snapshot', message };
}

const CONFLICTS: Readonly<
  Record<ConflictReason, (earlier: Improvement) => string>
> = {
  request_key_reused: (earlier) =>
    `The request key was used for other work, by the improvement ` +
    `${earlier.id.value}.`,
  work_already_requested: (earlier) =>
    `The same work was asked for already: the improvement ` +
    `${earlier.id.value} is ${earlier.status}.`,
  improvement_in_progress: (earlier) =>
    `${earlier.request.targetFile.value} is being improved already: the ` +
    `improvement ${earlier.id.value} is ${earlier.status}.`,
};

/** A conflict with earlier work names that improvement. */
export function conflictWith(
  reason: ConflictReason,
  earlier: Improvement,
): StartRefusal {
  return {
    outcome: 'refused',
    reason,
    message: CONFLICTS[reason](earlier),
    improvementId: earlier.id.value,
  };
}
