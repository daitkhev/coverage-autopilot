import { vi } from 'vitest';

import {
  type Improvement,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

import { isFinal, movesAgainstDesign } from '#tests/support/designed-moves';
import { send, type Storm } from '#tests/support/storm';

/**
 * An improvement takes seconds alone. A queue of them on a machine that
 * runs other tests beside them takes longer.
 */
const WORK_WAIT = { timeout: 120_000, interval: 100 };

/** What a look at an improvement does besides looking, such as a cancel. */
export type OnLook = (improvement: Improvement) => Promise<void>;

/** What the looks at one improvement saw. */
export interface Watched {
  /** Each status as the looks first saw it, in the order they saw them. */
  readonly seen: readonly ImprovementStatus[];
  readonly last: Improvement;
}

/** Final, or waiting for a person, which no worker ends. */
export function rests(improvement: Improvement): boolean {
  return (
    isFinal(improvement.status) || improvement.status === 'awaiting_approval'
  );
}

/** What the looks at one improvement saw that the design does not allow. */
export function watchFindings(watched: Watched): string[] {
  return movesAgainstDesign(watched.seen).map(
    (move) => `The improvement ${watched.last.id} was seen as ${move}.`,
  );
}

/**
 * Looks at an improvement, one look after the other, until `until` holds.
 * The looks never overlap, so the statuses they see are in the order the
 * improvement went through them.
 */
export async function watched(
  storm: Storm,
  id: string,
  look: {
    readonly until: (improvement: Improvement) => boolean;
    readonly onLook?: OnLook;
  },
): Promise<Watched> {
  const seen: ImprovementStatus[] = [];
  const last = await vi.waitFor(async () => {
    const answer = await send(storm, `/improvements/${id}`);
    const improvement = improvementSchema.parse(answer.body);
    if (seen.at(-1) !== improvement.status) {
      seen.push(improvement.status);
    }
    await look.onLook?.(improvement);
    if (!look.until(improvement)) {
      throw new Error(`The improvement ${id} is still ${improvement.status}.`);
    }
    return improvement;
  }, WORK_WAIT);
  return { seen, last };
}
