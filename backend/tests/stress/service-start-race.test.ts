import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Health,
  healthSchema,
} from '@coverage-autopilot/api-contracts/health';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { timerPause } from '#infrastructure/time/timer-pause';
import {
  type BuiltClient,
  type ClientEnd,
  HUNG,
} from '#tests/support/built-client';
import type { BuiltService } from '#tests/support/built-service';
import { servicesOf, signalEach } from '#tests/support/instance-services';
import { clientLogLines, instanceStateOf } from '#tests/support/instance-state';
import { drawnSeed, seededRandom } from '#tests/support/seeded-random';
import {
  PROCESS_WAIT,
  type StartRaceBench,
  startRaceBench,
} from '#tests/support/start-race-bench';
import {
  expectOneServes,
  healthOf,
  reachedPoint,
  type Round,
  START_POINTS,
  stopTheOneServing,
} from '#tests/support/start-rounds';

/**
 * Drawn anew for each run and named in the title of every test and in
 * every failure. A run is played with the same choices again by writing
 * its seed here in place of the draw.
 */
const random = seededRandom(drawnSeed());

/** Processes of the service, or runs of the client, started at once. */
const AT_ONCE = 8;

/**
 * How the service that serves is stopped before the next starts: a crash
 * leaves its socket file behind, and a clean stop removes it.
 */
const STOPS: readonly NodeJS.Signals[] = [
  'SIGKILL',
  'SIGKILL',
  'SIGKILL',
  'SIGTERM',
  'SIGTERM',
];

/**
 * How long after a step of a start its processes are killed: a step takes
 * a few milliseconds, so the crash lands in it or in the next one.
 */
const CRASH_JITTER_MS = 25;

/** How the service is killed while clients start. */
const KILLS: readonly NodeJS.Signals[] = [
  'SIGKILL',
  'SIGKILL',
  'SIGKILL',
  'SIGTERM',
  'SIGTERM',
  'SIGTERM',
];

/**
 * A client waits 20 seconds for a service it started, and 30 for an
 * answer. A run that takes longer than both hangs.
 */
const CLIENT_DEADLINE_MS = 60_000;

/** A command that reads from the service and prints its answer. */
const DOCTOR = ['doctor', '--json'];

/** The one line of a start that gives way to a service of the instance. */
const LEFT = [
  'The service left: another service holds the instance and listens on its socket.',
  'The service left: another service held the instance for the whole wait and did not listen on its socket.',
];

/** What a client says on its standard error once it starts a service. */
const STARTING = 'Starting the service\n';

let bench: StartRaceBench;

beforeEach(() => {
  bench = startRaceBench();
});

afterEach(async () => {
  await bench.close();
});

/** A round on the instance, named with the seed of the run. */
function roundOf(paths: InstancePaths, what: string): Round {
  return { paths, name: `seed ${String(random.seed)}, ${what}` };
}

/**
 * Starts the processes at once, and holds that every one but one leaves
 * by itself with 0 and its one line, and that the one left serves.
 */
async function raceOfServices(
  round: Round,
): Promise<{ readonly winner: BuiltService; readonly health: Health }> {
  const { name } = round;
  const started = bench.startServices(round.paths, AT_ONCE);
  const ended: BuiltService[] = [];
  for (const service of started) {
    void (async () => {
      await service.exitCode;
      ended.push(service);
    })();
  }
  await vi.waitFor(() => {
    expect(ended.length, name).toBeGreaterThanOrEqual(AT_ONCE - 1);
  }, PROCESS_WAIT);
  const health = await expectOneServes(round);
  const [winner, ...others] = started.filter((one) => !ended.includes(one));
  expect(others, name).toEqual([]);
  for (const left of ended) {
    await expect(left.exitCode, name).resolves.toBe(0);
    expect(
      LEFT.map((line) => `${line}\n`),
      name,
    ).toContain(await left.errors);
  }
  if (winner === undefined) {
    throw new Error(`${name}: no service serves.`);
  }
  return { winner, health };
}

/** How many lines of the log say that a started service left, or failed. */
function logCounts(paths: InstancePaths): { left: number; failed: number } {
  const lines = clientLogLines(paths);
  return {
    left: lines.filter((line) => LEFT.includes(line)).length,
    failed: lines.filter((line) => line.startsWith('The service did not'))
      .length,
  };
}

/** The end of every client, each by its deadline. */
function endingOf(
  clients: readonly BuiltClient[],
): Promise<ClientEnd | typeof HUNG>[] {
  return clients.map(async (client) => client.ended(CLIENT_DEADLINE_MS));
}

/** The ends of the clients, none of them a hang. */
async function endsOf(
  ending: readonly Promise<ClientEnd | typeof HUNG>[],
  round: Round,
): Promise<ClientEnd[]> {
  const ends = await Promise.all(ending);
  expect(ends, round.name).not.toContain(HUNG);
  return ends.flatMap((end) => (end === HUNG ? [] : [end]));
}

/** Settles once `count` of the clients have ended, and at once for none. */
async function endedCount(
  ending: readonly Promise<unknown>[],
  count: number,
): Promise<void> {
  const enough = Promise.withResolvers<undefined>();
  let ended = 0;
  const settle = (): void => {
    if (ended >= count) {
      enough.resolve(undefined);
    }
  };
  settle();
  for (const end of ending) {
    void (async () => {
      await end;
      ended += 1;
      settle();
    })();
  }
  await enough.promise;
}

/** The services the clients started: each says so once as it does. */
function startedBy(ends: readonly ClientEnd[]): number {
  return ends.filter((end) => end.stderr.startsWith(STARTING)).length;
}

/** The health a client printed, which it answered with 0. */
function answerOf(end: ClientEnd, round: Round): Health {
  expect(end, round.name).toMatchObject({ code: 0, signal: null });
  expect(['', STARTING], round.name).toContain(end.stderr);
  return healthSchema.parse(JSON.parse(end.stdout));
}

/** One client on the instance, which must be answered. */
async function oneClient(round: Round): Promise<void> {
  const clients = bench.startClients(round.paths, DOCTOR, 1);
  for (const end of await endsOf(endingOf(clients), round)) {
    answerOf(end, round);
  }
}

/**
 * Starts the clients at once where nothing answers, and holds that each
 * got the answer of the one service left serving, and that every other
 * service a client started left the instance to it, saying why.
 */
async function raceOfClients(round: Round): Promise<void> {
  const before = logCounts(round.paths);
  const clients = bench.startClients(round.paths, DOCTOR, AT_ONCE);
  const ends = await endsOf(endingOf(clients), round);
  const answers = ends.map((end) => answerOf(end, round));
  const health = await expectOneServes(round);
  expect(new Set(answers.map((one) => one.startedAt)), round.name).toEqual(
    new Set([health.startedAt]),
  );
  expect(logCounts(round.paths), round.name).toEqual({
    left: before.left + startedBy(ends) - 1,
    failed: before.failed,
  });
}

/**
 * The answer of a client whose service may be killed: the health, or the
 * one sentence that says the service it reached went away before the
 * command was answered. Never a hang, a fault or another failure.
 */
function answerOrSilence(end: ClientEnd, round: Round): Health[] {
  if (end.code === 0) {
    return [answerOf(end, round)];
  }
  expect(end, round.name).toEqual({
    code: 1,
    signal: null,
    stdout: '',
    stderr: `The service does not answer on ${round.paths.socket}.\n`,
  });
  return [];
}

/**
 * Kills the one service of the instance while clients start, once the
 * round's number of them has ended, and holds that each client ended with
 * its answer or the named failure, that a service one of them started
 * serves alone, or the lock is free when none started one, that every
 * answer came from the killed one or from that one, and that the next
 * client is answered.
 */
async function killWhileClientsStart(
  round: Round & { readonly afterEnds: number },
  signal: NodeJS.Signals,
): Promise<void> {
  const { paths, name } = round;
  const old = servicesOf(paths.directory);
  expect(old, name).toHaveLength(1);
  const before = { health: await healthOf(paths), log: logCounts(paths) };
  const ending = endingOf(bench.startClients(paths, DOCTOR, AT_ONCE));
  await endedCount(ending, round.afterEnds);
  signalEach(old, signal);
  const ends = await endsOf(ending, round);
  const answers = ends.flatMap((end) => answerOrSilence(end, round));
  const launched = startedBy(ends);
  await vi.waitFor(() => {
    const serving = servicesOf(paths.directory);
    expect(serving, name).not.toContain(old[0]);
    expect(serving, name).toHaveLength(Math.min(launched, 1));
  }, PROCESS_WAIT);
  if (launched === 0) {
    expect(instanceStateOf(paths), name).toMatchObject({ lockHeld: false });
  }
  expect(logCounts(paths), name).toEqual({
    left: before.log.left + Math.max(launched - 1, 0),
    failed: before.log.failed,
  });
  await oneClient(round);
  const health = await expectOneServes(round);
  expect(health.startedAt, name).not.toBe(before.health.startedAt);
  for (const answer of answers) {
    expect([before.health.startedAt, health.startedAt], name).toContain(
      answer.startedAt,
    );
  }
}

describe(`the start of the built service, seed ${String(random.seed)}`, () => {
  describe('when many services start at once on one instance', () => {
    it('should leave exactly one serving, round after round', async () => {
      const paths = bench.instance();
      const first = await raceOfServices(roundOf(paths, 'the first start'));
      const seen = [first.health.startedAt];
      let { winner } = first;
      for (const [index, signal] of random.shuffled(STOPS).entries()) {
        const round = roundOf(paths, `start ${String(index + 2)}, ${signal}`);
        await stopTheOneServing(round, signal);
        await expect(winner.exitCode, round.name).resolves.toBe(
          signal === 'SIGTERM' ? 0 : null,
        );
        const next = await raceOfServices(round);
        expect(seen, round.name).not.toContain(next.health.startedAt);
        seen.push(next.health.startedAt);
        winner = next.winner;
      }
      await stopTheOneServing(roundOf(paths, 'the last stop'), 'SIGTERM');
    });

    it('should serve with one after starts that were killed at a step', async () => {
      for (const point of START_POINTS) {
        const jitterMs = random.below(CRASH_JITTER_MS);
        const round = roundOf(
          bench.instance(),
          `crash ${String(jitterMs)} ms after the ${point}`,
        );
        const started = bench.startServices(round.paths, AT_ONCE);
        await reachedPoint(round.paths, point);
        await timerPause(jitterMs);
        started.forEach((service) => {
          service.signal('SIGKILL');
        });
        await Promise.all(started.map(async (service) => service.exitCode));
        expect(servicesOf(round.paths.directory), round.name).toEqual([]);
        await raceOfServices(round);
        await stopTheOneServing(round, 'SIGTERM');
      }
    });
  });

  describe('when many clients start at once and no service answers', () => {
    it('should answer each from one service, and leave it serving', async () => {
      const paths = bench.instance();
      await raceOfClients(roundOf(paths, 'clients on a new instance'));
      for (const signal of ['SIGKILL', 'SIGTERM'] as const) {
        const round = roundOf(paths, `clients after ${signal}`);
        await stopTheOneServing(round, signal);
        await raceOfClients(round);
      }
      await stopTheOneServing(roundOf(paths, 'the last stop'), 'SIGTERM');
    });
  });

  describe('when the service is killed while clients start', () => {
    it('should end each with its answer or a named failure', async () => {
      const paths = bench.instance();
      const first = roundOf(paths, 'the first client');
      await oneClient(first);
      await expectOneServes(first);
      for (const [index, signal] of random.shuffled(KILLS).entries()) {
        const afterEnds = random.below(AT_ONCE);
        const what = `kill ${String(index + 1)}, ${signal} after ${String(afterEnds)} ends`;
        const round = { ...roundOf(paths, what), afterEnds };
        await killWhileClientsStart(round, signal);
      }
      await stopTheOneServing(roundOf(paths, 'the last stop'), 'SIGTERM');
    });
  });
});
