import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { Instant } from '#kernel/time/instant';
import type { EnqueueJobRequest } from '#ports/job-queue.port';

/** The version of the payload of an improvement job this service writes. */
export const IMPROVEMENT_JOB_VERSION = 1;

/**
 * A job of an improvement says nothing but whose it is: its handler reads
 * the status of the improvement and goes on from there. So every job of
 * one improvement differs from the others in its key alone.
 */
function jobOf(improvement: Improvement, step: string): EnqueueJobRequest {
  const id = improvement.id.value;
  return {
    kind: 'improvement',
    repositoryId: improvement.request.repositoryId,
    idempotencyKey: `improvement:${id}:${step}`,
    subjectId: id,
    payload: { version: IMPROVEMENT_JOB_VERSION },
  };
}

/** The job a new improvement starts with. It runs up to a wait or an end. */
export function runJobOf(improvement: Improvement): EnqueueJobRequest {
  return jobOf(improvement, 'run');
}

/** The job an approval adds: the one before it ended when it asked. */
export function publishJobOf(improvement: Improvement): EnqueueJobRequest {
  return jobOf(improvement, 'publish');
}

/**
 * The job that goes on when the window of the subscription opens. Each
 * wait of an improvement has a job of its own, named by its number.
 */
export function resumeJobOf(
  improvement: Improvement,
  notBefore: Instant,
): EnqueueJobRequest {
  const wait = String(improvement.limitWaits);
  return { ...jobOf(improvement, `resume:${wait}`), notBefore };
}
