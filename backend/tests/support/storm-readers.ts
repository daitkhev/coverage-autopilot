import { setTimeout } from 'node:timers/promises';

import { improvementStatusSchema } from '@coverage-autopilot/api-contracts/statuses';

import { OK } from '#tests/support/contract-ledger';
import type { SeededRandom } from '#tests/support/seeded-random';
import { choicesOf, send, type Storm } from '#tests/support/storm';

/** Reads a reader sends at once before it pauses. */
const READS_AT_ONCE = 6;

/**
 * Paces the readers, so they press on the service beside the bursts and
 * the worker rather than take all of it. It proves nothing.
 */
const READ_PAUSE_MS = 40;

/** The readers of a run, and what they found once stopped. */
export interface Readers {
  /** Stops every reader after its reads in flight, and gives what broke. */
  stop(): Promise<string[]>;
}

type Read = (storm: Storm, random: SeededRandom) => string | null;

/** A read of one of `ids`, or none while the run knows none of them. */
function under(
  ids: (storm: Storm) => readonly string[],
  path: (id: string) => string,
): Read {
  return (storm, random) => {
    const known = ids(storm);
    return known.length === 0 ? null : path(random.pick(known));
  };
}

function repositories(storm: Storm): string[] {
  return [...storm.ids.values()];
}

/**
 * Every read a client makes, of things that are there. The access check
 * starts git and gh, so it is one read in many.
 */
const READS: readonly Read[] = [
  () => '/health',
  () => '/repositories',
  () => '/settings/budget',
  () => '/improvements',
  (storm, random) =>
    under(
      repositories,
      (id) =>
        `/improvements?repositoryId=${id}&status=` +
        random.pick(improvementStatusSchema.options),
    )(storm, random),
  under(repositories, (id) => `/repositories/${id}`),
  under(repositories, (id) => `/repositories/${id}/snapshots`),
  under(repositories, (id) => `/repositories/${id}/access`),
  under(
    (storm) => storm.known.scans,
    (id) => `/scans/${id}`,
  ),
  under(
    (storm) => storm.known.snapshots,
    (id) => `/snapshots/${id}/files`,
  ),
  under(
    (storm) => storm.known.improvements,
    (id) => `/improvements/${id}`,
  ),
];

/** A read of something that is there is answered, whatever runs beside it. */
async function readsAtOnce(
  storm: Storm,
  random: SeededRandom,
): Promise<string[]> {
  const paths = Array.from({ length: READS_AT_ONCE }, () =>
    random.pick(READS)(storm, random),
  ).filter((path) => path !== null);
  const answers = await Promise.allSettled(
    paths.map(async (path) => send(storm, path)),
  );
  return answers.flatMap((settled, index) => {
    const path = paths[index] ?? '';
    if (settled.status === 'rejected') {
      return [`GET ${path} got no answer: ${String(settled.reason)}`];
    }
    const { status, body } = settled.value;
    return status === OK
      ? []
      : [`GET ${path} was answered ${String(status)}: ${JSON.stringify(body)}`];
  });
}

/**
 * Starts readers that ask for every list and every known thing again and
 * again, beside whatever else the run sends, until they are stopped. Each
 * answer is judged by the contract like any other.
 */
export function startedReaders(storm: Storm, count: number): Readers {
  let stopping = false;
  const findings: string[] = [];
  const running = Array.from({ length: count }, async (_, index) => {
    const random = choicesOf(storm, `reader:${String(index)}`);
    while (!stopping) {
      findings.push(...(await readsAtOnce(storm, random)));
      await setTimeout(READ_PAUSE_MS);
    }
  });
  return {
    stop: async () => {
      stopping = true;
      await Promise.all(running);
      return findings;
    },
  };
}
