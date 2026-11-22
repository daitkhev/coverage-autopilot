import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONTRACT_VERSION } from '@coverage-autopilot/api-contracts/health';
import { ContractMismatchError } from '@coverage-autopilot/api-contracts/parsing';

import {
  type IsolatedService,
  type IsolatedServiceOptions,
  startIsolatedService,
} from '#api/isolated-service';
import type { ServiceWait } from '#api/polling';
import type { ServiceCommand } from '#api/service-launch';
import { IDLE_HEALTH } from '#tests/support/sample-repositories';
import {
  PATIENT_WAIT,
  type ServiceStartBench,
  serviceStartBench,
} from '#tests/support/service-start-bench';
import type { StandInPlay } from '#tests/support/service-start-stand-in';

type ReadyService = Extract<IsolatedService, { readonly outcome: 'ready' }>;

const ANSWERS: StandInPlay = { health: IDLE_HEALTH };

const SHORT_WAIT = { totalMs: 200, intervalMs: 20 };

const PREFIX = 'coverage-autopilot-';

describe('startIsolatedService', () => {
  let bench: ServiceStartBench;

  beforeEach(() => {
    bench = serviceStartBench();
  });

  afterEach(async () => {
    await bench.close();
  });

  /** The options of the bench, with the instance made under its folder. */
  function isolated(
    command: ServiceCommand,
    wait: ServiceWait = PATIENT_WAIT,
  ): IsolatedServiceOptions {
    return { ...bench.options(command, wait), temporaryRoot: bench.root };
  }

  /** The instance folders the client made under the folder of the bench. */
  function instances(): string[] {
    return readdirSync(bench.root).filter((name) => name.startsWith(PREFIX));
  }

  async function ready(options: IsolatedServiceOptions): Promise<ReadyService> {
    const service = await startIsolatedService(options);
    if (service.outcome !== 'ready') {
      throw new Error(`It did not start: ${service.lines.join(' ')}`);
    }
    return service;
  }

  it('should start a service of its own in a new folder under the root', async () => {
    const service = await ready(isolated(bench.standIn(ANSWERS)));

    expect(service).toMatchObject({ outcome: 'ready', health: IDLE_HEALTH });
    expect(instances()).toHaveLength(1);
    expect(
      existsSync(join(bench.root, instances()[0] ?? '', 'service.sock')),
    ).toBe(true);
    expect(bench.steps).toEqual(['starting']);
  });

  describe('stop', () => {
    it('should end the service and remove its folder', async () => {
      const service = await ready(isolated(bench.standIn(ANSWERS)));

      await service.stop();

      expect(bench.runningIds()).toEqual([]);
      expect(instances()).toEqual([]);
    });

    it('should kill a service that holds on when it is asked to end', async () => {
      const options = isolated(
        bench.standIn({ ...ANSWERS, holdsOnTerm: true }),
      );
      let started = false;
      const service = await ready({
        ...options,
        // The start waits as long as it must, and the stop not at all.
        pause: async (ms) => {
          if (!started) {
            await options.pause(ms);
          }
        },
      });
      started = true;

      await service.stop();

      expect(bench.runningIds()).toEqual([]);
      expect(instances()).toEqual([]);
    });

    it('should remove the folder of a service that already left', async () => {
      const stop = { status: 202, body: { stopping: true }, leaves: true };
      const service = await ready(
        isolated(bench.standIn({ ...ANSWERS, stop })),
      );
      await service.api.stopService();
      await bench.pauseUntil(() => {
        expect(bench.runningIds()).toEqual([]);
      })(0);

      await service.stop();

      expect(instances()).toEqual([]);
    });
  });

  describe('when the service never answers', () => {
    it('should end it, and keep its folder for the log', async () => {
      const service = await startIsolatedService({
        ...isolated(bench.standIn({ errors: ['stuck'] }), SHORT_WAIT),
        pause: bench.pauseUntil(() => {
          expect(bench.startedIds()).toHaveLength(1);
        }),
      });

      expect(service).toMatchObject({
        outcome: 'did_not_start',
        lines: ['stuck'],
      });
      expect(bench.runningIds()).toEqual([]);
      expect(
        service.outcome === 'did_not_start' && existsSync(service.log),
      ).toBe(true);
    });
  });

  describe('when the service answers with a health of another shape', () => {
    it('should end it, remove its folder, and throw the mismatch', async () => {
      const command = bench.standIn({
        health: { contractVersion: CONTRACT_VERSION },
      });

      await expect(startIsolatedService(isolated(command))).rejects.toThrow(
        ContractMismatchError,
      );
      expect(bench.runningIds()).toEqual([]);
      expect(instances()).toEqual([]);
    });
  });

  describe('when the program cannot be started', () => {
    it('should remove the folder and throw why', async () => {
      await expect(
        startIsolatedService(isolated([join(bench.root, 'no-such-program')])),
      ).rejects.toThrow('ENOENT');
      expect(instances()).toEqual([]);
    });
  });
});
