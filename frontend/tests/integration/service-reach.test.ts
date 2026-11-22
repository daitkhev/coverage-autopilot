import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { CONTRACT_VERSION } from '@coverage-autopilot/api-contracts/health';
import { ContractMismatchError } from '@coverage-autopilot/api-contracts/parsing';

import type { ServiceWait } from '#api/polling';
import type { ServiceCommand } from '#api/service-launch';
import { reachService, type ServiceReach } from '#api/service-reach';
import type { ServiceStartOptions } from '#api/service-start';
import { BUSY_HEALTH, IDLE_HEALTH } from '#tests/support/sample-repositories';
import {
  GIVEN_VARIABLES,
  type ServiceStartBench,
  serviceStartBench,
} from '#tests/support/service-start-bench';
import type { StandInPlay } from '#tests/support/service-start-stand-in';

/** A health of a later contract, with a field this client does not know. */
const OTHER_IDLE = {
  contractVersion: CONTRACT_VERSION + 1,
  activeWork: { scans: 0, improvements: 0 },
  fieldOfALaterContract: true,
};

/** A health of an earlier contract that lacks fields of this one. */
const OTHER_BUSY = {
  contractVersion: CONTRACT_VERSION - 1,
  activeWork: BUSY_HEALTH.activeWork,
};

const STOPPING = { status: 202, body: { stopping: true }, leaves: true };

const WORK_RUNS: ErrorBody = {
  error: 'status_conflict',
  message: '1 jobs are running.',
};

const ANSWERS: StandInPlay = { health: IDLE_HEALTH };

/** Short, for a test that waits for what never comes. */
const SHORT_WAIT = { totalMs: 200, intervalMs: 20 };

const EARLIER_LINE = 'a line of an earlier start';

const SHELL_ADDS = ['PWD=', 'SHLVL=', '_='];

describe('reachService', () => {
  let bench: ServiceStartBench;

  beforeEach(() => {
    bench = serviceStartBench();
  });

  afterEach(async () => {
    await bench.close();
  });

  /** Reaches the instance, with a stand-in that plays `play` if one starts. */
  async function reach(
    play: StandInPlay = ANSWERS,
    wait?: ServiceWait,
  ): Promise<ServiceReach> {
    return reachService(bench.options(bench.standIn(play), wait));
  }

  /** The options of the bench, whose client waits until a stand-in started. */
  function untilStarted(command: ServiceCommand): ServiceStartOptions {
    return {
      ...bench.options(command, SHORT_WAIT),
      pause: bench.pauseUntil(() => {
        expect(bench.startedIds()).toHaveLength(1);
      }),
    };
  }

  function writeEarlierLog(): void {
    mkdirSync(bench.location.directory);
    writeFileSync(bench.location.log, `${EARLIER_LINE}\n`);
  }

  describe('when a service of this contract answers', () => {
    it('should use it as it is, start none, and give a client of it', async () => {
      await bench.runStandIn(ANSWERS);

      const reached = await reach();

      expect(reached).toMatchObject({ outcome: 'ready', health: IDLE_HEALTH });
      expect(bench.steps).toEqual([]);
      expect(bench.startedIds()).toHaveLength(1);
      if (reached.outcome === 'ready') {
        await expect(reached.api.health()).resolves.toEqual(IDLE_HEALTH);
      }
    });
  });

  describe('when nothing answers', () => {
    it('should start the service once, and wait until it answers', async () => {
      const reached = await reach();

      expect(reached).toMatchObject({ outcome: 'ready', health: IDLE_HEALTH });
      expect(bench.steps).toEqual(['starting']);
      expect(bench.startedIds()).toHaveLength(1);
    });

    it('should keep the instance directory and the log to the user', async () => {
      await reach();

      expect(statSync(bench.location.directory).mode & 0o777).toBe(0o700);
      expect(statSync(bench.location.log).mode & 0o777).toBe(0o600);
    });

    it('should append what the service writes to the log', async () => {
      writeEarlierLog();

      await reach({ ...ANSWERS, errors: ['listening'] });

      expect(readFileSync(bench.location.log, 'utf8')).toBe(
        `${EARLIER_LINE}\nlistening\n`,
      );
    });

    it('should give the service exactly its variables and its instance', async () => {
      const reached = await reachService(
        bench.options(['/bin/sh', '-c', '/usr/bin/env >&2; exit 1']),
      );

      expect(reached.outcome).toBe('did_not_start');
      const lines = reached.outcome === 'did_not_start' ? reached.lines : [];
      const given = lines.filter(
        (line) => !SHELL_ADDS.some((added) => line.startsWith(added)),
      );
      expect(given.toSorted()).toEqual([
        `AUTOPILOT_INSTANCE_DIR=${bench.location.directory}`,
        `GIVEN=${GIVEN_VARIABLES.GIVEN}`,
      ]);
    });

    describe('when the process exits at once', () => {
      it('should say so with what this start wrote, before the wait is over', async () => {
        writeEarlierLog();
        const why = 'The service did not start: the folder is taken.';

        const reached = await reach(
          { errors: [why], exitCode: 1 },
          { totalMs: 600_000, intervalMs: 20 },
        );

        expect(reached).toEqual({
          outcome: 'did_not_start',
          lines: [why],
          log: bench.location.log,
        });
      });
    });

    describe('when the service never answers', () => {
      it('should say it did not start, and leave it running', async () => {
        const command = bench.standIn({ errors: ['migrating the database'] });

        const reached = await reachService(untilStarted(command));

        expect(reached).toEqual({
          outcome: 'did_not_start',
          lines: ['migrating the database'],
          log: bench.location.log,
        });
        expect(bench.runningIds()).toHaveLength(1);
      });
    });

    describe('when the process leaves with 0, as one that found another holding the instance', () => {
      it('should go on waiting for that other one to answer', async () => {
        const pauses: number[] = [];
        const options = untilStarted(bench.standIn({ exitCode: 0 }));
        const ended = bench.pauseUntil(() => {
          expect(bench.runningIds()).toEqual([]);
        });

        const reached = await reachService({
          ...options,
          pause: async (ms) => {
            pauses.push(ms);
            await options.pause(ms);
            await ended(ms);
          },
        });

        expect(reached.outcome).toBe('did_not_start');
        expect(pauses).toHaveLength(10);
      });
    });
  });

  describe('when an idle service of another contract answers', () => {
    it('should stop it, wait until it is gone, and start this one', async () => {
      await bench.runStandIn({ health: OTHER_IDLE, stop: STOPPING });

      const reached = await reach();

      expect(reached).toMatchObject({ outcome: 'ready', health: IDLE_HEALTH });
      expect(bench.steps).toEqual(['stopping_the_old_one', 'starting']);
      expect(bench.requests().slice(0, 2)).toEqual([
        'GET /health',
        'POST /service/stop',
      ]);
      expect(bench.startedIds()).toHaveLength(2);
    });

    describe('when it does not go in time', () => {
      it('should say this one did not start, and start none', async () => {
        await bench.runStandIn({
          health: OTHER_IDLE,
          stop: { ...STOPPING, leaves: false },
        });

        const reached = await reach(ANSWERS, SHORT_WAIT);

        expect(reached).toEqual({
          outcome: 'did_not_start',
          lines: [],
          log: bench.location.log,
        });
        expect(bench.steps).toEqual(['stopping_the_old_one']);
        expect(bench.startedIds()).toHaveLength(1);
      });
    });

    describe('when it refuses to stop, as work started since', () => {
      it('should read its health again and say what runs', async () => {
        await bench.runStandIn({
          health: OTHER_IDLE,
          stop: { status: 409, body: WORK_RUNS, leaves: false },
        });

        const reached = await reach();

        expect(reached).toEqual({
          outcome: 'busy_with_another_version',
          contractVersion: OTHER_IDLE.contractVersion,
          activeWork: OTHER_IDLE.activeWork,
        });
        expect(bench.requests()).toEqual([
          'GET /health',
          'POST /service/stop',
          'GET /health',
        ]);
      });
    });
  });

  describe('when a busy service of another contract answers', () => {
    it('should leave it as it is, and say what runs', async () => {
      await bench.runStandIn({ health: OTHER_BUSY, stop: STOPPING });

      const reached = await reach();

      expect(reached).toEqual({
        outcome: 'busy_with_another_version',
        contractVersion: OTHER_BUSY.contractVersion,
        activeWork: OTHER_BUSY.activeWork,
      });
      expect(bench.steps).toEqual([]);
      expect(bench.requests()).toEqual(['GET /health']);
    });
  });

  describe('when the health of another contract does not say its work', () => {
    it('should throw a mismatch of the contract', async () => {
      await bench.runStandIn({ health: { contractVersion: 1 } });

      await expect(reach()).rejects.toThrow(ContractMismatchError);
    });
  });
});
