import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { ApprovalMismatchError } from '#improvement/domain/errors/approval-mismatch.error';
import {
  acceptedOf,
  requireOpenAttempt,
  withAttempt,
} from '#improvement/domain/services/attempt-list.service';
import {
  moved,
  requireStatus,
  touched,
} from '#improvement/domain/services/status-move.service';
import { BranchName } from '#improvement/domain/value-objects/branch-name.vo';
import type { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';
import type { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import type { Instant } from '#kernel/time/instant';

/** Publishing gets the branch that follows from the id. */
function publishing(state: ImprovementState, at: Instant): ImprovementState {
  return { ...moved(state, 'publishing', at), branch: BranchName.of(state.id) };
}

/**
 * Records the verdict of the gate on the patch of the open attempt. An
 * accepted patch is published, or waits for a person in review mode. A
 * rejected one closes the attempt, and the next attempt is generated if
 * the budget allows. An inconclusive one keeps the attempt open: the
 * caller runs the gate again or fails the improvement.
 */
export function afterVerdict(
  state: ImprovementState,
  report: VerificationReport,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'verifying');
  const attempt = requireOpenAttempt(state.attempts).withReport(report, at);
  const judged = { ...state, attempts: withAttempt(state.attempts, attempt) };
  switch (report.verdict) {
    case 'accepted':
      return state.request.mode === 'review'
        ? moved(judged, 'awaiting_approval', at)
        : publishing(judged, at);
    case 'rejected':
      return moved(judged, 'generating', at);
    case 'inconclusive':
      return touched(judged, at);
  }
}

/** A person approves the patch they saw, named by its hash. */
export function approved(
  state: ImprovementState,
  patchHash: string,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'awaiting_approval');
  const accepted = acceptedOf(state.attempts)?.patch?.hash;
  if (accepted !== patchHash) {
    throw new ApprovalMismatchError(
      `The patch ${patchHash} was approved, and the accepted patch is ` +
        `${String(accepted)}.`,
    );
  }
  return publishing(state, at);
}

/** The pull request is there, so the improvement is complete. */
export function published(
  state: ImprovementState,
  pullRequest: PullRequestRef,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'publishing');
  return { ...moved(state, 'completed', at), pullRequest };
}
