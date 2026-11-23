import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { closedCountOf } from '#improvement/domain/services/attempt-list.service';
import type { BudgetLimit } from '#improvement/domain/value-objects/budget.vo';
import { BudgetUsage } from '#improvement/domain/value-objects/budget-usage.vo';
import {
  isFinal,
  waitOf,
} from '#improvement/domain/value-objects/improvement-status.vo';
import type { Instant } from '#kernel/time/instant';

/** Whether generation may go on, and the limit that stops it when not. */
export type AttemptAllowance =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly spent: BudgetLimit };

/**
 * The end of the work so far: now while it works, and the start of the
 * current status while it waits or once it is over.
 */
function endOfWork(state: ImprovementState, at: Instant): Instant {
  const resting = isFinal(state.status) || waitOf(state.status) !== null;
  return resting ? state.phaseStartedAt : at;
}

function secondsOf(state: ImprovementState, at: Instant): number {
  return state.request.budget.secondsUsed(
    state.deadlineAt,
    endOfWork(state, at),
  );
}

function tokensOf(state: ImprovementState): number {
  return state.attempts.reduce((sum, attempt) => sum + attempt.tokensUsed, 0);
}

/** What the improvement spent: every attempt opened, the open one too. */
export function usageOf(state: ImprovementState, at: Instant): BudgetUsage {
  return BudgetUsage.create({
    attempts: state.attempts.length,
    tokens: tokensOf(state),
    seconds: secondsOf(state, at),
  });
}

/**
 * Whether generation may go on at `at`. Only attempts that are over count
 * here, so the open attempt of a run after a crash may finish, and a new
 * one opens only while one of the limit is left.
 */
export function allowanceOf(
  state: ImprovementState,
  at: Instant,
): AttemptAllowance {
  const spent = state.request.budget.spentLimit(
    BudgetUsage.create({
      attempts: closedCountOf(state.attempts),
      tokens: tokensOf(state),
      seconds: secondsOf(state, at),
    }),
  );
  return spent === null ? { allowed: true } : { allowed: false, spent };
}
