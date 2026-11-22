import { setTimeout } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { logFaults } from '#tests/support/log-faults';
import { drawnSeed } from '#tests/support/seeded-random';
import { storedFindings } from '#tests/support/stored-history';
import {
  startedStorm,
  type Storm,
  type StormSizes,
} from '#tests/support/storm';
import { idleFindings, publications } from '#tests/support/storm-end';
import { improvedAtOnce } from '#tests/support/storm-improvements';
import { type Readers, startedReaders } from '#tests/support/storm-readers';
import { registeredAtOnce } from '#tests/support/storm-registrations';
import { scannedAtOnce } from '#tests/support/storm-scans';

/**
 * Every choice of the run comes from this seed, and the name of every
 * test carries it. To make the choices of a failed run again, write its
 * seed here in place of the call. The order the service answers in is
 * the scheduler's, and no seed repeats it.
 */
const SEED = drawnSeed();

/** Each a copy of the project of the journey: one file to improve, one covered. */
const REPOSITORIES = 6;

/** Each round registers, scans and improves every repository again. */
const ROUNDS = [1, 2, 3];

const SIZES: StormSizes = {
  atOnce: 48,
  spread: 6,
  scanKeys: 3,
  requestKeys: 3,
  freshKeys: 3,
  cancelsAtOnce: 4,
  approvalsAtOnce: 6,
  cancelChance: 0.4,
  foreignKeyChance: 0.15,
  wrongHashChance: 0.3,
};

/** Loops that read beside everything else, from the start to the end. */
const READERS = 4;

/** Jobs the worker runs at once, each on a repository of its own. */
const WORKER_PLACES = 4;

/** A cancel is heard at the next heartbeat, and every one is a write. */
const HEARTBEAT_MS = 200;

/** Fictional, and in no other place. */
const CREDENTIAL = 'fictional-storm-credential-2718';

/** A start takes seconds under load. */
const START_TIMEOUT_MS = 60_000;

/** A round waits for its scans and its improvements, on a loaded machine. */
const ROUND_TIMEOUT_MS = 240_000;

/** A stop waits for the jobs in flight, which a failed run may leave. */
const STOP_WAIT_MS = 20_000;

let storm: Storm | undefined;
let readers: Readers | undefined;

function running(): Storm {
  if (storm === undefined) {
    throw new Error(
      `The service of the storm did not start, seed ${String(SEED)}.`,
    );
  }
  return storm;
}

/**
 * Asks the service to stop as a person would, and kills it if it has not
 * within the wait, so no process of the run outlives it.
 */
async function stopped(hosted: Storm['hosted']): Promise<void> {
  hosted.service.signal('SIGTERM');
  await Promise.race([hosted.service.exitCode, setTimeout(STOP_WAIT_MS)]);
  await hosted.close();
}

async function besideFindings(round: number): Promise<string[]> {
  const scans = await scannedAtOnce(running(), `beside-r${String(round)}`);
  return scans.findings;
}

/** A burst that failed is a finding, once the other burst has ended too. */
function findingsOf(result: PromiseSettledResult<string[]>): string[] {
  return result.status === 'fulfilled' ? result.value : [String(result.reason)];
}

/** A change on the default branch that touches no file of the project. */
function movedHeads(round: number): void {
  for (const fullName of running().repositories) {
    running().hosted.host.commit(fullName, {
      'NOTES.md': `Round ${String(round)}.\n`,
    });
  }
}

beforeAll(async () => {
  storm = await startedStorm({
    seed: SEED,
    sizes: SIZES,
    repositoryCount: REPOSITORIES,
    variables: {
      CLAUDE_CODE_OAUTH_TOKEN: CREDENTIAL,
      AUTOPILOT_QUEUE_CONCURRENCY: String(WORKER_PLACES),
      AUTOPILOT_QUEUE_HEARTBEAT_MS: String(HEARTBEAT_MS),
    },
  });
  readers = startedReaders(storm, READERS);
}, START_TIMEOUT_MS);

afterAll(async () => {
  await readers?.stop();
  if (storm !== undefined) {
    await stopped(storm.hosted);
  }
}, START_TIMEOUT_MS);

describe(`many requests at once while jobs run, seed ${String(SEED)}`, () => {
  for (const round of ROUNDS) {
    describe(`round ${String(round)}`, () => {
      let snapshots: ReadonlyMap<string, string> = new Map();

      it('should register each repository once, in every spelling', async () => {
        expect(await registeredAtOnce(running(), round)).toEqual([]);
      });

      it(
        'should queue one scan for a key and keep a cancelled scan cancelled',
        async () => {
          const scans = await scannedAtOnce(running(), `r${String(round)}`);
          snapshots = scans.snapshots;

          expect(scans.findings).toEqual([]);
        },
        ROUND_TIMEOUT_MS,
      );

      it(
        'should keep one improvement live per file and end each once, while scans run',
        async () => {
          // From the second round on, the default branch moves just before
          // the requests, so they all bring the new head at once.
          if (round > 1) {
            movedHeads(round);
          }
          const bursts = await Promise.allSettled([
            improvedAtOnce(running(), { number: round, snapshots }),
            besideFindings(round),
          ]);

          expect(bursts.flatMap(findingsOf)).toEqual([]);
        },
        ROUND_TIMEOUT_MS,
      );
    });
  }

  describe('at the end', () => {
    it('should have answered every read of something that is there', async () => {
      const found = (await readers?.stop()) ?? ['The readers never started.'];

      expect(found).toEqual([]);
    });

    it('should hold a pull request for each completed improvement and no other', async ({
      annotate,
    }) => {
      const ended = await publications(running());
      const byStatus = Object.groupBy(
        ended.improvements,
        ({ status }) => status,
      );
      await annotate(
        `seed ${String(SEED)}: ${String(running().ledger.count)} requests, ` +
          `${String(running().hosted.host.gh.pullRequests().length)} pull requests, ` +
          `${String(ended.cancelledWhilePublishing)} of them cancelled while publishing, ` +
          Object.entries(byStatus)
            .map(([status, items]) => `${String(items.length)} ${status}`)
            .join(', '),
      );

      expect(ended.findings).toEqual([]);
    });

    it('should be idle once its work ended, and stop cleanly when asked', async () => {
      const idle = await idleFindings(running());
      running().hosted.service.signal('SIGTERM');

      expect(idle).toEqual([]);
      expect(await running().hosted.service.exitCode).toBe(0);
    });

    it('should keep a database that passes its checks and holds no open work', () => {
      expect(storedFindings(running().hosted.service.paths)).toEqual([]);
    });

    it('should write no line in the log that names a defect', () => {
      expect(logFaults(running().hosted.service.log())).toEqual([]);
    });

    it('should have given no answer the contract does not name', () => {
      expect(running().ledger.findings()).toEqual([]);
    });
  });
});
