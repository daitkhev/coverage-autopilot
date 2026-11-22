import type {
  Attempt,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';

/** The improvement, and the repository that names it and holds the threshold. */
export interface LoadedImprovement {
  readonly improvement: Improvement;
  readonly repository: Repository;
}

/**
 * The improvement and its repository in one answer, so the screen asks
 * one request on its timer. A refusal of either is the answer.
 */
export async function loadImprovement(
  api: ServiceApi,
  improvementId: string,
): Promise<ServiceAnswer<LoadedImprovement>> {
  const improvement = await api.getImprovement(improvementId);
  if (improvement.outcome === 'refused') {
    return improvement;
  }
  const repository = await api.getRepository(improvement.value.repositoryId);
  return repository.outcome === 'refused'
    ? repository
    : {
        ...improvement,
        value: { improvement: improvement.value, repository: repository.value },
      };
}

/** The four ways an improvement ends. Nothing runs after them. */
const ENDED: ReadonlySet<ImprovementStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'skipped',
]);

/** Whether the improvement has ended, so it cannot be cancelled. */
export function hasEnded(improvement: Improvement): boolean {
  return ENDED.has(improvement.status);
}

/**
 * The statuses before an attempt was accepted, while further attempts can
 * still come, so the step line shows the ones the limit allows.
 */
const TRYING: ReadonlySet<ImprovementStatus> = new Set([
  'created',
  'analyzing',
  'generating',
  'waiting_for_limit',
  'verifying',
]);

/** Whether more attempts can still come. */
export function isTrying(improvement: Improvement): boolean {
  return TRYING.has(improvement.status);
}

/** The attempt the gate accepted, whose patch can be read. */
export function acceptedOf(improvement: Improvement): Attempt | undefined {
  return improvement.attempts.find(
    (attempt) => attempt.report?.verdict === 'accepted',
  );
}

/**
 * The first report that measured the file before any test was added: the
 * baseline of the work, which the improvement itself does not carry.
 */
export function baselineOf(
  improvement: Improvement,
): VerificationReport | undefined {
  return (
    improvement.attempts.find((attempt) => attempt.report?.coverageBefore)
      ?.report ?? undefined
  );
}

/** The last attempt the gate judged, whose numbers say how close it came. */
export function lastJudgedOf(improvement: Improvement): Attempt | undefined {
  return improvement.attempts.findLast((attempt) => attempt.report !== null);
}

/** When the improvement stopped, or now while it runs. */
export function endOf(improvement: Improvement, now: string): string {
  if (!hasEnded(improvement)) {
    return now;
  }
  return improvement.cancelledAt ?? improvement.updatedAt;
}
