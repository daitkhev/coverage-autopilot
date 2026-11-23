import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type {
  ImprovementStatus,
  WaitingFor,
} from '@coverage-autopilot/api-contracts/statuses';

import type { Role } from '#theme/roles';
import { besideStatusWords, type ResultWords } from '#theme/status';

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

/** Whether the work can still be cancelled: by its status, it has not ended. */
export function canBeCancelled({ status }: Improvement): boolean {
  return GROUP_OF_STATUS[status] !== 'finished';
}

export function groupOf(improvement: Improvement): GroupName {
  return improvement.waitingFor === null
    ? GROUP_OF_STATUS[improvement.status]
    : GROUP_OF_WAIT[improvement.waitingFor];
}

/** A row has no room for an address or a code: a number and a sentence. */
const RESULT_WORDS: ResultWords = {
  completed: ({ pullRequest }) =>
    pullRequest === null
      ? 'published'
      : `pull request #${String(pullRequest.number)}`,
  failed: ({ failure }) => failure?.message ?? 'failed',
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
  return besideStatusWords(improvement, timeZone, RESULT_WORDS);
}

/** The moment its age is told from: how long it has run, or since when. */
export function ageMomentOf(improvement: Improvement): string {
  return groupOf(improvement) === 'running'
    ? improvement.createdAt
    : improvement.updatedAt;
}
