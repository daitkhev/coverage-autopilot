import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type {
  ImprovementStatus,
  WaitingFor,
} from '@coverage-autopilot/api-contracts/statuses';

import { clockWords } from '#theme/moments';
import type { Role } from '#theme/roles';

/** What an improvement needs now: the user, the worker, its turn, nothing. */
export type GroupName = 'needsYou' | 'running' | 'waiting' | 'finished';

/** A group of the list: its heading, in the role it is drawn in. */
export interface GroupLook {
  readonly title: string;
  readonly role: Role;
  /** What `enter` leads to for an improvement of the group. */
  readonly next: string;
  /** How long it has been so, from its age, such as `waiting for 3h`. */
  readonly since: (age: string) => string;
}

/** The groups in the order they are drawn: `Needs you` is always first. */
export const GROUP_LOOKS: Readonly<Record<GroupName, GroupLook>> = {
  needsYou: {
    title: 'NEEDS YOU',
    role: 'accent',
    next: 'review the patch',
    since: (age) => `waiting for you for ${age}`,
  },
  running: {
    title: 'RUNNING',
    role: 'running',
    next: 'follow the work',
    since: (age) => `running for ${age}`,
  },
  waiting: {
    title: 'WAITING',
    role: 'emphasis',
    next: 'see what it waits for',
    since: (age) => `waiting for ${age}`,
  },
  finished: {
    title: 'FINISHED',
    role: 'emphasis',
    next: 'see how it ended',
    since: (age) => `ended ${age} ago`,
  },
};

/** The group of an improvement that waits for nobody, by its status. */
const GROUP_OF_STATUS: Readonly<Record<ImprovementStatus, GroupName>> = {
  created: 'waiting',
  analyzing: 'running',
  generating: 'running',
  waiting_for_limit: 'waiting',
  verifying: 'running',
  awaiting_approval: 'needsYou',
  publishing: 'running',
  completed: 'finished',
  failed: 'finished',
  cancelled: 'finished',
  skipped: 'finished',
};

/**
 * Who acts next, as the service says it: what an improvement waits for
 * wins over its status.
 */
const GROUP_OF_WAIT: Readonly<Record<WaitingFor, GroupName>> = {
  approval: 'needsYou',
  worker: 'waiting',
  repository: 'waiting',
  limit: 'waiting',
};

export function groupOf(improvement: Improvement): GroupName {
  return improvement.waitingFor === null
    ? GROUP_OF_STATUS[improvement.status]
    : GROUP_OF_WAIT[improvement.waitingFor];
}

type Words = (improvement: Improvement, timeZone: string) => string;

const WAIT_WORDS: Readonly<Record<WaitingFor, Words>> = {
  approval: () => 'approve the patch',
  worker: () => 'waits for a free worker',
  repository: () => 'waits for its repository',
  limit: ({ resumesAt }, timeZone) =>
    resumesAt === null
      ? 'waits for the limit of the generator'
      : `limit spent, resumes at ${clockWords(resumesAt, timeZone)}`,
};

function attemptWords({ usage, budget }: Improvement): string {
  return `attempt ${String(usage.attempts)} of ${String(budget.attempts)}`;
}

/** Which of the checks runs, counted in the steps the service wrote. */
function checkWords({ progress }: Improvement): string {
  const steps = progress?.steps ?? [];
  const running = steps.findIndex((step) => step.status === 'running');
  return running === -1
    ? 'verifying'
    : `check ${String(running + 1)} of ${String(steps.length)}`;
}

const STATUS_WORDS: Readonly<Record<ImprovementStatus, Words>> = {
  created: () => 'waits for its turn',
  analyzing: () => 'analyzing',
  generating: (improvement) => `${attemptWords(improvement)}, writing a test`,
  waiting_for_limit: (improvement, timeZone) =>
    WAIT_WORDS.limit(improvement, timeZone),
  verifying: (improvement) =>
    `${attemptWords(improvement)}, ${checkWords(improvement)}`,
  awaiting_approval: () => 'approve the patch',
  publishing: () => 'publishing',
  completed: ({ pullRequest }) =>
    pullRequest === null
      ? 'published'
      : `pull request #${String(pullRequest.number)}`,
  failed: ({ failure }) => failure?.message ?? 'failed',
  cancelled: ({ cancelledAt }, timeZone) =>
    cancelledAt === null
      ? 'cancelled'
      : `cancelled at ${clockWords(cancelledAt, timeZone)}`,
  skipped: ({ skip }) => skip?.message ?? 'skipped',
};

/**
 * What the improvement does or waits for, beside its status: what it
 * waits for, how far it has come, or how it ended.
 */
export function besideWords(
  improvement: Improvement,
  timeZone: string,
): string {
  const words =
    improvement.waitingFor === null
      ? STATUS_WORDS[improvement.status]
      : WAIT_WORDS[improvement.waitingFor];
  return words(improvement, timeZone);
}

/** The moment its age is told from: how long it has run, or since when. */
export function ageMomentOf(improvement: Improvement): string {
  return groupOf(improvement) === 'running'
    ? improvement.createdAt
    : improvement.updatedAt;
}
