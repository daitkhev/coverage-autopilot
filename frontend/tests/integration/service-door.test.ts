import { readdirSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import { timestampSchema } from '@coverage-autopilot/api-contracts/values';

import { doorOf, type ServiceSetting, sessionOf } from '#app/service-door';
import { fakeServiceApi } from '#tests/support/fake-service-api';
import { IDLE_HEALTH } from '#tests/support/sample-repositories';
import {
  type ServiceStartBench,
  serviceStartBench,
} from '#tests/support/service-start-bench';

const ISOLATED_PREFIX = 'coverage-autopilot-';

describe('doorOf', () => {
  let bench: ServiceStartBench;

  beforeEach(() => {
    bench = serviceStartBench();
  });

  afterEach(async () => {
    await bench.close();
  });

  function setting(): ServiceSetting {
    return {
      instance: {
        home: bench.root,
        instanceDirectory: bench.location.directory,
      },
      command: bench.standIn({ health: IDLE_HEALTH }),
      variables: {},
      temporaryRoot: bench.root,
    };
  }

  function ownInstances(): string[] {
    return readdirSync(bench.root).filter((name) =>
      name.startsWith(ISOLATED_PREFIX),
    );
  }

  describe('when the client uses the service of the user', () => {
    it('should start it where the setting says, and leave it running', async () => {
      const steps: string[] = [];
      const door = doorOf(setting(), { isolated: false });

      const reached = await door.reach((step) => steps.push(step));
      await door.leave();

      expect(reached.outcome).toBe('ready');
      expect(steps).toEqual(['starting']);
      expect(bench.runningIds()).toHaveLength(1);
      expect(ownInstances()).toEqual([]);
    });

    it('should find the service that runs already', async () => {
      const door = doorOf(setting(), { isolated: false });
      await door.reach(() => undefined);

      const again = await door.reach(() => undefined);

      expect(again.outcome).toBe('ready');
      expect(bench.startedIds()).toHaveLength(1);
    });
  });

  describe('when the client uses a service of its own', () => {
    it('should start one service however often it is reached', async () => {
      const door = doorOf(setting(), { isolated: true });

      const first = await door.reach(() => undefined);
      const second = await door.reach(() => undefined);

      expect(first.outcome).toBe('ready');
      expect(second).toBe(first);
      expect(bench.startedIds()).toHaveLength(1);
      expect(ownInstances()).toHaveLength(1);
      await door.leave();
    });

    it('should start it again in its folder once it stopped answering', async () => {
      const stop = { status: 202, body: { stopping: true }, leaves: true };
      const command = bench.standIn({ health: IDLE_HEALTH, stop });
      const door = doorOf({ ...setting(), command }, { isolated: true });
      const first = await door.reach(() => undefined);
      if (first.outcome !== 'ready') {
        throw new Error('The first service did not start.');
      }
      await first.api.stopService();
      await bench.pauseUntil(() => {
        expect(bench.runningIds()).toEqual([]);
      })(0);

      const second = await door.reach(() => undefined);

      expect(second.outcome).toBe('ready');
      expect(bench.startedIds()).toHaveLength(2);
      expect(ownInstances()).toHaveLength(1);
      await expect(first.api.health()).resolves.toEqual(IDLE_HEALTH);
      await door.leave();
      expect(bench.runningIds()).toEqual([]);
      expect(ownInstances()).toEqual([]);
    });

    it('should stop it and remove its folder on the way out', async () => {
      const door = doorOf(setting(), { isolated: true });
      await door.reach(() => undefined);

      await door.leave();

      expect(bench.runningIds()).toEqual([]);
      expect(ownInstances()).toEqual([]);
    });

    describe('when its start fails', () => {
      it('should keep the folder of the last try alone, and none after leaving', async () => {
        const command = bench.standIn({ errors: ['broken'], exitCode: 1 });
        const door = doorOf({ ...setting(), command }, { isolated: true });

        const first = await door.reach(() => undefined);
        const shown = ownInstances();
        const second = await door.reach(() => undefined);

        expect([first.outcome, second.outcome]).toEqual([
          'did_not_start',
          'did_not_start',
        ]);
        expect(shown).toHaveLength(1);
        expect(ownInstances()).toHaveLength(1);
        expect(ownInstances()).not.toEqual(shown);
        await door.leave();
        expect(ownInstances()).toEqual([]);
        expect(bench.runningIds()).toEqual([]);
      });
    });

    it('should leave nothing behind when it was never reached', async () => {
      const door = doorOf(setting(), { isolated: true });

      await door.leave();

      expect(bench.startedIds()).toEqual([]);
    });
  });

  it('should wait with the pause of the client', async () => {
    const door = doorOf(setting(), { isolated: false });

    await expect(door.pause(1)).resolves.toBeUndefined();
  });
});

describe('sessionOf', () => {
  it('should give the api, the clock and the zone of the user', () => {
    const api = fakeServiceApi({});

    const session = sessionOf(api);
    const moment = session.now();

    expect(session.api).toBe(api);
    expect(parseAs(timestampSchema, moment)).toBe(moment);
    expect(session.timeZone).not.toBe('');
  });
});
