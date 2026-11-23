import type { Attempt } from '#improvement/domain/entities/attempt.entity';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';

/** The attempt that is open, which is always the last one, or `null`. */
export function openAttemptOf(attempts: readonly Attempt[]): Attempt | null {
  return attempts.find((attempt) => attempt.isOpen) ?? null;
}

export function requireOpenAttempt(attempts: readonly Attempt[]): Attempt {
  const open = openAttemptOf(attempts);
  if (open === null) {
    throw new InvalidTransitionError('The improvement has no open attempt.');
  }
  return open;
}

/** The list with an attempt in the place of the one of the same number. */
export function withAttempt(
  attempts: readonly Attempt[],
  changed: Attempt,
): readonly Attempt[] {
  return attempts.map((attempt) =>
    attempt.number === changed.number ? changed : attempt,
  );
}

/** The attempts that are over: they count against the budget of attempts. */
export function closedCountOf(attempts: readonly Attempt[]): number {
  return attempts.filter((attempt) => !attempt.isOpen).length;
}

function lastWithVerdict(
  attempts: readonly Attempt[],
  verdict: 'accepted' | 'rejected',
): Attempt | null {
  return (
    attempts.findLast((attempt) => attempt.report?.verdict === verdict) ?? null
  );
}

/** The last attempt the gate rejected: its report is feedback. */
export function lastRejectedOf(attempts: readonly Attempt[]): Attempt | null {
  return lastWithVerdict(attempts, 'rejected');
}

/** The attempt whose patch the gate accepted. There is one at most. */
export function acceptedOf(attempts: readonly Attempt[]): Attempt | null {
  return lastWithVerdict(attempts, 'accepted');
}
