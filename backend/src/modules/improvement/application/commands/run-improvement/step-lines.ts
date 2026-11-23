import type { StepResult } from '#improvement/application/commands/run-improvement/improvement-step';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { JobContext } from '#ports/job-handler.port';
import type { LogFields } from '#ports/logger.port';

/**
 * The ids that tie the lines of one journey together, so a search for
 * any of them finds the step: the improvement, its repository and the
 * job that runs it.
 */
export function stepFieldsOf(
  improvement: Improvement,
  context: Pick<JobContext, 'jobId'>,
): LogFields {
  return {
    improvementId: improvement.id.value,
    repositoryId: improvement.request.repositoryId.value,
    jobId: context.jobId,
    step: improvement.status,
  };
}

/**
 * How a step ended: the status it left the improvement in, and why it
 * failed or was skipped; or that it runs again, and why. Never what the
 * failure says, which may quote the output of a tool.
 */
export function stepEndOf(
  result: StepResult,
  improvement: Improvement,
): LogFields {
  if (result.next === 'retry') {
    return { outcome: 'retry', reason: result.reason.code };
  }
  const why = improvement.failure ?? improvement.skip;
  return why === null
    ? { outcome: improvement.status }
    : { outcome: improvement.status, reason: why.reason };
}
