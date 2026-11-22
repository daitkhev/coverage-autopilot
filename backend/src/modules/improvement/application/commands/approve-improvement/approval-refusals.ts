import type { ApprovalRefusal } from '#improvement/application/commands/approve-improvement/approve-improvement.command';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';

/**
 * Why a person may not approve the patch the hash names now, or `null`
 * when they may. The improvement refuses the same with a typed error; it
 * is asked first so that a person who saw an older patch, or approves
 * twice, gets an answer and not a fault.
 */
export function approvalRefusalOf(
  improvement: Improvement,
  patchHash: string,
): ApprovalRefusal | null {
  const id = improvement.id.value;
  if (improvement.status !== 'awaiting_approval') {
    return {
      outcome: 'refused',
      reason: 'status_conflict',
      message:
        `The improvement ${id} is ${improvement.status}, and only one ` +
        'that awaits approval can be approved.',
    };
  }
  const accepted = String(improvement.acceptedAttempt?.patch?.hash);
  return accepted === patchHash
    ? null
    : {
        outcome: 'refused',
        reason: 'patch_hash_mismatch',
        message:
          `The accepted patch of the improvement ${id} is ${accepted}, ` +
          `not ${patchHash}.`,
      };
}
