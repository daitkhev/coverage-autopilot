import { publicationTextOf } from '#improvement/application/commands/run-improvement/publication-text';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import type { PublishPatchRequest } from '#repositories/contracts/repositories-public-api';

/**
 * The request that publishes the patch of the accepted attempt on the
 * branch the improvement holds. Both follow from what is stored, so a
 * run after a crash asks for the very same publication.
 */
export function publishPatchRequestOf(
  improvement: Improvement,
): PublishPatchRequest {
  const accepted = improvement.acceptedAttempt;
  const patch = accepted?.patch ?? null;
  const report = accepted?.report ?? null;
  const { branch, request } = improvement;
  if (patch === null || report === null || branch === null) {
    throw new InvalidTransitionError(
      `The improvement is ${improvement.status} and has no accepted patch ` +
        'on a branch to publish.',
    );
  }
  return {
    repositoryId: request.repositoryId,
    baseCommit: request.baseCommit,
    patchText: patch.text,
    branchName: branch.value,
    ...publicationTextOf({
      targetFile: request.targetFile,
      baseCommit: request.baseCommit,
      report,
    }),
  };
}
