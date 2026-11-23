import {
  Attempt,
  type ClosingOutcome,
} from '#improvement/domain/entities/attempt.entity';
import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { BudgetSpentError } from '#improvement/domain/errors/budget-spent.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import {
  openAttemptOf,
  requireOpenAttempt,
  withAttempt,
} from '#improvement/domain/services/attempt-list.service';
import { allowanceOf } from '#improvement/domain/services/budget-use.service';
import {
  failed,
  moved,
  requireStatus,
  touched,
} from '#improvement/domain/services/status-move.service';
import type {
  Generation,
  GeneratorCall,
} from '#improvement/domain/value-objects/generation.vo';
import {
  type FailureReason,
  ImprovementFailure,
} from '#improvement/domain/value-objects/improvement-failure.vo';
import type { Instant } from '#kernel/time/instant';

/** A spent window is waited for twice. The third fails the improvement. */
export const MAX_LIMIT_WAITS = 2;

const THIRD_WINDOW = {
  reason: 'quota_exhausted',
  message: 'The five-hour window of the subscription was spent a third time.',
} as const;

/** The outcomes that end the improvement, and how. */
const FAILURES: Readonly<
  Partial<Record<ClosingOutcome, { reason: FailureReason; message: string }>>
> = {
  quota_exhausted: {
    reason: 'quota_exhausted',
    message:
      'The account of the generator has no usage left, and a few hours ' +
      'of waiting would not bring it back.',
  },
  credential_exposed: {
    reason: 'credential_exposed',
    message:
      'A file the generator changed held its credential, so nothing it ' +
      'wrote was kept.',
  },
};

function withChanged(
  state: ImprovementState,
  attempt: Attempt,
): ImprovementState {
  return { ...state, attempts: withAttempt(state.attempts, attempt) };
}

/**
 * The attempt to generate with. After a crash it is the open attempt,
 * which has no patch yet. A new one opens only while the budget allows.
 */
export function withAttemptOpened(
  state: ImprovementState,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'generating');
  if (openAttemptOf(state.attempts) !== null) {
    return state;
  }
  const allowance = allowanceOf(state, at);
  if (!allowance.allowed) {
    throw new BudgetSpentError(
      `The budget of ${allowance.spent} is spent, so no attempt opens.`,
    );
  }
  const opened = Attempt.open(state.attempts.length + 1, at);
  return {
    ...touched(state, at),
    attempts: [...state.attempts, opened],
    phaseStartedAt: at,
  };
}

/** A call that left no patch closes the attempt, or ends the improvement. */
function closedBy(
  state: ImprovementState,
  outcome: ClosingOutcome,
  at: Instant,
): ImprovementState {
  const failure = FAILURES[outcome];
  return failure === undefined
    ? touched(state, at)
    : failed(state, ImprovementFailure.create(failure), at);
}

/** The attempt stays open, and a wait spends no attempt and no minute. */
function waitedFor(
  state: ImprovementState,
  resumesAt: Instant,
  at: Instant,
): ImprovementState {
  if (state.limitWaits >= MAX_LIMIT_WAITS) {
    return failed(state, ImprovementFailure.create(THIRD_WINDOW), at);
  }
  return {
    ...moved(state, 'waiting_for_limit', at),
    resumesAt,
    limitWaits: state.limitWaits + 1,
  };
}

/**
 * Records how a call of the generator ended. A generated patch is kept in
 * full with the move to `verifying`. The same patch once more is a run
 * after a crash and changes nothing.
 */
export function afterGeneration(
  state: ImprovementState,
  generation: Generation,
  at: Instant,
): ImprovementState {
  if (generation.outcome === 'generated' && state.status === 'verifying') {
    requireOpenAttempt(state.attempts).withPatch(generation.patch);
    return state;
  }
  requireStatus(state, 'generating');
  const attempt = requireOpenAttempt(state.attempts).withCall(generation);
  switch (generation.outcome) {
    case 'generated':
      return moved(
        withChanged(state, attempt.withPatch(generation.patch)),
        'verifying',
        at,
      );
    case 'window_exhausted':
      return waitedFor(withChanged(state, attempt), generation.resumesAt, at);
    default:
      return closedBy(
        withChanged(state, attempt.closedBy(generation.outcome, at)),
        generation.outcome,
        at,
      );
  }
}

/** A call whose output must not be used, and why the improvement fails. */
export interface UnusableCall {
  readonly call: GeneratorCall;
  readonly failure: ImprovementFailure;
}

/**
 * An unusable call ends the improvement. What it spent was paid for, so
 * it is kept with the attempt, and nothing it wrote is.
 */
export function failedAfterCall(
  state: ImprovementState,
  unusable: UnusableCall,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'generating');
  const attempt = requireOpenAttempt(state.attempts).withCall(unusable.call);
  return failed(withChanged(state, attempt), unusable.failure, at);
}

/** The window opened: the same attempt generates again. */
export function resumed(
  state: ImprovementState,
  at: Instant,
): ImprovementState {
  requireStatus(state, 'waiting_for_limit');
  const { resumesAt } = state;
  if (resumesAt !== null && at.isBefore(resumesAt)) {
    throw new InvalidTransitionError(
      `The improvement waits until ${resumesAt.toString()}.`,
    );
  }
  return moved(state, 'generating', at);
}
