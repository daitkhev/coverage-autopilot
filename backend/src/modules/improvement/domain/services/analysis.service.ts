import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { BaselineMismatchError } from '#improvement/domain/errors/baseline-mismatch.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import {
  moved,
  requireStatus,
  touched,
} from '#improvement/domain/services/status-move.service';
import type { ImprovementSkip } from '#improvement/domain/value-objects/improvement-skip.vo';
import type { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import type { VerificationBaseline } from '#improvement/domain/value-objects/verification-baseline.vo';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { Instant } from '#kernel/time/instant';

/** The fresh snapshot of `analyzing`, with the commit it measured. */
export interface BaselineSnapshot {
  readonly id: SnapshotId;
  readonly commit: CommitSha;
}

function requireBaseCommit(state: ImprovementState, commit: CommitSha): void {
  const { baseCommit } = state.request;
  if (!commit.equals(baseCommit)) {
    throw new BaselineMismatchError(
      `The improvement is made on ${baseCommit.value}, and the baseline ` +
        `measured ${commit.value}.`,
    );
  }
}

/** Work starts, and the limit of minutes becomes a deadline. */
export function workStarted(
  state: ImprovementState,
  at: Instant,
): ImprovementState {
  return {
    ...moved(state, 'analyzing', at),
    deadlineAt: state.request.budget.deadlineFrom(at),
  };
}

/**
 * A run of `analyzing` after a crash measures again, so a snapshot
 * recorded before is replaced, as long as it names the same commit.
 */
export function withBaselineSnapshot(
  state: ImprovementState,
  snapshot: BaselineSnapshot,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'analyzing');
  requireBaseCommit(state, snapshot.commit);
  return { ...touched(state, at), baselineSnapshotId: snapshot.id };
}

export function withVerificationBaseline(
  state: ImprovementState,
  baseline: VerificationBaseline,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'analyzing');
  requireBaseCommit(state, baseline.commit);
  const { targetFile } = state.request;
  if (!baseline.targetFile.equals(targetFile)) {
    throw new BaselineMismatchError(
      `The improvement is for ${targetFile.value}, and the baseline ` +
        `measured ${baseline.targetFile.value}.`,
    );
  }
  return { ...touched(state, at), verificationBaseline: baseline };
}

/** Generation needs both baselines: the gate compares every patch with them. */
export function generationStarted(
  state: ImprovementState,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'analyzing');
  if (
    state.baselineSnapshotId === null ||
    state.verificationBaseline === null
  ) {
    throw new InvalidTransitionError(
      'Generation starts once the baseline snapshot and the baseline of ' +
        'the gate are recorded.',
    );
  }
  return moved(state, 'generating', at);
}

export function skipped(
  state: ImprovementState,
  skip: ImprovementSkip,
  at: Instant,
): ImprovementState {
  return { ...moved(state, 'skipped', at), skip };
}
