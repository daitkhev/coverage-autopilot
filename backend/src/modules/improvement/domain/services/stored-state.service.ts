import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  acceptedOf,
  openAttemptOf,
} from '#improvement/domain/services/attempt-list.service';
import { MAX_LIMIT_WAITS } from '#improvement/domain/services/generation.service';
import {
  type ImprovementStatus,
  isFinal,
} from '#improvement/domain/value-objects/improvement-status.vo';

/** The statuses an attempt can be open in: generation and the gate. */
const WITH_OPEN_ATTEMPT: readonly ImprovementStatus[] = [
  'generating',
  'waiting_for_limit',
  'verifying',
];

/** The statuses that come after the gate accepted a patch. */
const AFTER_ACCEPTANCE: readonly ImprovementStatus[] = [
  'awaiting_approval',
  'publishing',
  'completed',
];

function hasBaselines(state: ImprovementState): boolean {
  return (
    state.baselineSnapshotId !== null && state.verificationBaseline !== null
  );
}

function baselineFits(state: ImprovementState): boolean {
  const { request, verificationBaseline } = state;
  return (
    verificationBaseline === null ||
    (verificationBaseline.commit.equals(request.baseCommit) &&
      verificationBaseline.targetFile.equals(request.targetFile))
  );
}

/** A rule that holds for every state it applies to. */
interface StateRule {
  readonly says: string;
  readonly appliesTo: (state: ImprovementState) => boolean;
  readonly holdsFor: (state: ImprovementState) => boolean;
}

const always = (): boolean => true;

function isWithin(value: number, low: number, high: number): boolean {
  return Number.isInteger(value) && value >= low && value <= high;
}

const RULES: readonly StateRule[] = [
  {
    says: 'it keeps a moment to go on at exactly while it waits for a limit',
    appliesTo: always,
    holdsFor: (state) =>
      (state.status === 'waiting_for_limit') === (state.resumesAt !== null),
  },
  {
    says: 'only a failed improvement has a failure',
    appliesTo: (state) => state.failure !== null,
    holdsFor: (state) => state.status === 'failed',
  },
  {
    says: 'only a skipped improvement has a skip',
    appliesTo: (state) => state.skip !== null,
    holdsFor: (state) => state.status === 'skipped',
  },
  {
    says: 'only a complete improvement has a pull request',
    appliesTo: (state) => state.pullRequest !== null,
    holdsFor: (state) => state.status === 'completed',
  },
  {
    says: 'its baseline of the gate measured its base commit and its file',
    appliesTo: always,
    holdsFor: baselineFits,
  },
  {
    says: 'it has a deadline once its work started',
    appliesTo: (state) => state.status !== 'created' && !isFinal(state.status),
    holdsFor: (state) => state.deadlineAt !== null,
  },
  {
    says: 'it generates only once both baselines are recorded',
    appliesTo: (state) =>
      WITH_OPEN_ATTEMPT.includes(state.status) ||
      AFTER_ACCEPTANCE.includes(state.status),
    holdsFor: hasBaselines,
  },
  {
    says: 'it publishes only a patch the gate accepted',
    appliesTo: (state) => AFTER_ACCEPTANCE.includes(state.status),
    holdsFor: (state) => acceptedOf(state.attempts) !== null,
  },
  {
    says: 'it waits for a window at most twice',
    appliesTo: always,
    holdsFor: (state) => isWithin(state.limitWaits, 0, MAX_LIMIT_WAITS),
  },
  {
    says: 'its attempts are numbered from 1 with no gap',
    appliesTo: always,
    holdsFor: (state) =>
      state.attempts.every((attempt, index) => attempt.number === index + 1),
  },
  {
    says: 'only its last attempt may be open',
    appliesTo: (state) => openAttemptOf(state.attempts) !== null,
    holdsFor: (state) => state.attempts.at(-1)?.isOpen === true,
  },
  {
    says: 'an attempt is open only while it generates or verifies',
    appliesTo: (state) => openAttemptOf(state.attempts) !== null,
    holdsFor: (state) => WITH_OPEN_ATTEMPT.includes(state.status),
  },
  {
    says: 'one that verifies has an open attempt with a patch',
    appliesTo: (state) => state.status === 'verifying',
    holdsFor: (state) => openAttemptOf(state.attempts)?.patch != null,
  },
  {
    says: 'its version is a whole number from 1',
    appliesTo: always,
    holdsFor: (state) => isWithin(state.version, 1, Number.MAX_SAFE_INTEGER),
  },
];

/**
 * The rules a stored improvement holds, which its transitions keep. A
 * state that breaks one was not written by them, so it is refused.
 */
export function checkedState(state: ImprovementState): ImprovementState {
  const broken = RULES.find(
    (rule) => rule.appliesTo(state) && !rule.holdsFor(state),
  );
  if (broken !== undefined) {
    throw new InvalidImprovementValueError(
      `The improvement ${state.id.value} breaks a rule: ${broken.says}.`,
    );
  }
  return state;
}
