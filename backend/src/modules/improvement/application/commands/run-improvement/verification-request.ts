import { verificationBaselineDtoOf } from '#improvement/application/commands/run-improvement/verification-mapping';
import type { Attempt } from '#improvement/domain/entities/attempt.entity';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import type { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import type { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import type { VerificationBaseline } from '#improvement/domain/value-objects/verification-baseline.vo';
import type { Instant } from '#kernel/time/instant';
import type {
  CheckProgress,
  ProgressObserver,
  VerifyPatchRequest,
} from '#verification/contracts/verification-public-api';

/** What a call of the gate takes besides the improvement. */
export interface GateCall {
  /** Whose work it is, as the run names it. */
  readonly owner: string;
  readonly testFileSuffixes: readonly string[];
  readonly onProgress: ProgressObserver<CheckProgress>;
}

/** What an improvement holds for the gate while it verifies. */
interface GateInput {
  readonly attempt: Attempt;
  readonly patch: TestPatch;
  readonly baseline: VerificationBaseline;
  readonly baselineSnapshotId: SnapshotId;
  readonly deadline: Instant;
}

/** The rules of the aggregate keep all of it for a `verifying` status. */
function gateInputOf(improvement: Improvement): GateInput {
  const attempt = improvement.currentAttempt;
  const patch = attempt?.patch ?? null;
  const { verificationBaseline, baselineSnapshotId } = improvement;
  if (
    attempt === null ||
    patch === null ||
    verificationBaseline === null ||
    baselineSnapshotId === null
  ) {
    throw new InvalidTransitionError(
      `The improvement is ${improvement.status} and has no stored patch ` +
        'for the gate to verify.',
    );
  }
  return {
    attempt,
    patch,
    baseline: verificationBaseline,
    baselineSnapshotId,
    deadline: improvement.workDeadline,
  };
}

/**
 * The request of the gate for the open attempt. The patch is the stored
 * one, never a folder a generator touched, so a run after a crash
 * verifies the very text that was saved.
 */
export function verifyPatchRequestOf(
  improvement: Improvement,
  call: GateCall,
): VerifyPatchRequest {
  const input = gateInputOf(improvement);
  const { request } = improvement;
  const { policy } = request;
  return {
    repositoryId: request.repositoryId,
    baseCommit: request.baseCommit,
    patch: { text: input.patch.text, hash: input.patch.hash },
    targetFile: request.targetFile,
    testFileSuffixes: call.testFileSuffixes,
    baselineSnapshotId: input.baselineSnapshotId.value,
    baseline: verificationBaselineDtoOf(input.baseline),
    policy: {
      requiredChecks: policy.requiredChecks,
      repeatedRuns: policy.repeatedRuns,
      mutationThreshold: policy.mutationThreshold,
    },
    deadline: input.deadline,
    owner: `${call.owner}:attempt:${String(input.attempt.number)}`,
    onProgress: call.onProgress,
  };
}
