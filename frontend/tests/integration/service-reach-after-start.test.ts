import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONTRACT_VERSION } from '@coverage-autopilot/api-contracts/health';

import { reachService } from '#api/service-reach';
import type { ServiceStartOptions } from '#api/service-start';
import { BUSY_HEALTH, IDLE_HEALTH } from '#tests/support/sample-repositories';
import {
  type ServiceStartBench,
  serviceStartBench,
} from '#tests/support/service-start-bench';
import type { StandInPlay } from '#tests/support/service-start-stand-in';

/** Healths of a later contract, in the shape of this one. */
const OTHER_IDLE = { ...IDLE_HEALTH, contractVersion: CONTRACT_VERSION + 1 };
const OTHER_BUSY = { ...BUSY_HEALTH, contractVersion: CONTRACT_VERSION + 1 };

const STOPPING = { status: 202, body: { stopping: true }, leaves: true };

describe('reachService', () => {
  let bench: ServiceStartBench;

  beforeEach(() => {
    bench = serviceStartBench();
  });

  afterEach(async () => {
    await bench.close();
  });

  /**
   * The options of a start that gives way: the process the client starts
   * leaves at once, as one that finds the instance held does, and then a
   * service another client started answers in its place.
   */
  function givingWayTo(other: StandInPlay): ServiceStartOptions {
    const options = bench.options(bench.standIn({ exitCode: 0 }));
    const left = bench.pauseUntil(() => {
      expect(bench.startedIds()).toHaveLength(1);
      expect(bench.runningIds()).toEqual([]);
    });
    let answering: Promise<void> | undefined;
    return {
      ...options,
      pause: async (ms) => {
        answering ??= (async () => {
          await left(ms);
          await bench.runStandIn(other);
        })();
        await answering;
      },
    };
  }

  describe('when a service of another contract answers after the start', () => {
    it('should leave a busy one as it is, and say what runs', async () => {
      const reached = await reachService(givingWayTo({ health: OTHER_BUSY }));

      expect(reached).toEqual({
        outcome: 'busy_with_another_version',
        contractVersion: OTHER_BUSY.contractVersion,
        activeWork: OTHER_BUSY.activeWork,
      });
      expect(bench.steps).toEqual(['starting']);
      expect(bench.requests()).toEqual(['GET /health']);
      expect(bench.runningIds()).toHaveLength(1);
    });

    it('should replace an idle one once, and leave the next one as it is', async () => {
      const command = bench.standIn({ health: OTHER_IDLE, stop: STOPPING });

      const reached = await reachService(bench.options(command));

      expect(reached).toEqual({
        outcome: 'busy_with_another_version',
        contractVersion: OTHER_IDLE.contractVersion,
        activeWork: OTHER_IDLE.activeWork,
      });
      expect(bench.steps).toEqual([
        'starting',
        'stopping_the_old_one',
        'starting',
      ]);
      expect(
        bench.requests().filter((request) => request.startsWith('POST')),
      ).toEqual(['POST /service/stop']);
      expect(bench.startedIds()).toHaveLength(2);
      expect(bench.runningIds()).toHaveLength(1);
    });
  });
});
