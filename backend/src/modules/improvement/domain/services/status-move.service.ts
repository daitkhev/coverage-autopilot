import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { Budget } from '#improvement/domain/value-objects/budget.vo';
import type { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import {
  canMove,
  type ImprovementStatus,
  isFinal,
  waitOf,
} from '#improvement/domain/value-objects/improvement-status.vo';
import type { Instant } from '#kernel/time/instant';

export function requireStatus(
  state: ImprovementState,
  status: ImprovementStatus,
): void {
  if (state.status !== status) {
    throw new InvalidTransitionError(
      `The improvement is ${state.status}, and this step is for one that ` +
        `is ${status}.`,
    );
  }
}

/** A change inside the current status. */
export function touched(
  state: ImprovementState,
  at: Instant,
): ImprovementState {
  return { ...state, updatedAt: at };
}

/**
 * The deadline once the current status is left. Time spent in a wait is
 * not work, so leaving a wait in any direction moves the deadline later
 * by its length, and the usage of a cancelled wait stays what it was.
 */
function deadlineAfter(state: ImprovementState, at: Instant): Instant | null {
  const { deadlineAt } = state;
  return deadlineAt === null || waitOf(state.status) === null
    ? deadlineAt
    : Budget.postpone(deadlineAt, state.phaseStartedAt, at);
}

/**
 * The one way a status changes, along the table of the two state
 * machines. A final status closes the attempt that is still open.
 */
export function moved(
  state: ImprovementState,
  to: ImprovementStatus,
  at: Instant,
): ImprovementState {
  if (!canMove(state.status, to)) {
    throw new InvalidTransitionError(
      `An improvement that is ${state.status} cannot become ${to}.`,
    );
  }
  return {
    ...state,
    status: to,
    deadlineAt: deadlineAfter(state, at),
    resumesAt: null,
    attempts: isFinal(to)
      ? state.attempts.map((attempt) => attempt.endedAt(at))
      : state.attempts,
    phaseStartedAt: at,
    updatedAt: at,
  };
}

export function failed(
  state: ImprovementState,
  failure: ImprovementFailure,
  at: Instant,
): ImprovementState {
  return { ...moved(state, 'failed', at), failure };
}
