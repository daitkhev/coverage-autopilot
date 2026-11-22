import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';

import { InvalidMigrationFileError } from '#infrastructure/database/errors/invalid-migration-file.error';
import { SystemClock } from '#infrastructure/time/system-clock.adapter';
import type { RunningService } from '#service/running-service';
import type { ServiceRun } from '#service/service-run';
import {
  askOver,
  type ServiceBench,
  serviceBench,
} from '#tests/support/service-bench';

/** The bits of a mode that say who may read, write and enter. */
const PERMISSIONS = 0o777;

let bench: ServiceBench;

function running(run: ServiceRun): RunningService {
  if (run.outcome !== 'running') {
    throw new Error(`The service did not run: ${run.outcome}.`);
  }
  return run.service;
}

async function started(): Promise<RunningService> {
  return running(await bench.run());
}

afterEach(async () => {
  await bench.close();
});

describe('runService', () => {
  it('should listen on the socket of its instance, kept to its owner', async () => {
    bench = serviceBench();
    await started();

    const { socket, directory } = bench.config.instance;
    expect(statSync(socket).isSocket()).toBe(true);
    expect(statSync(socket).mode & PERMISSIONS).toBe(0o600);
    expect(statSync(directory).mode & PERMISSIONS).toBe(0o700);
  });

  it('should answer a path no route has in the shape of the contract', async () => {
    bench = serviceBench();
    await started();

    const answer = await askOver(bench.config.instance.socket, '/nowhere');

    expect(answer.status).toBe(404);
    expect(errorSchema.parse(answer.body).error).toBe('not_found');
  });

  it('should hold its instance against a second service', async () => {
    bench = serviceBench();
    await started();
    const second = await bench.run();

    const answer = await askOver(bench.config.instance.socket, '/nowhere');

    expect(second).toEqual({ outcome: 'held_by_another' });
    expect(answer.status).toBe(404);
    expect(bench.lockIsFree()).toBe(false);
  });

  it('should tell when it began to answer', async () => {
    bench = serviceBench();
    const clock = new SystemClock();
    const before = clock.now();

    const service = await started();

    expect(service.startedAt.isBefore(before)).toBe(false);
    expect(clock.now().isBefore(service.startedAt)).toBe(false);
  });

  describe('when it stops', () => {
    it('should leave no socket and give the lock to the next service', async () => {
      bench = serviceBench();
      const first = await started();

      await first.stop();

      expect(existsSync(bench.config.instance.socket)).toBe(false);
      expect(bench.lockIsFree()).toBe(true);
      const third = await started();
      const answer = await askOver(bench.config.instance.socket, '/nowhere');
      expect(answer.status).toBe(404);
      await third.stop();
    });

    it('should stop once, however often it is asked', async () => {
      bench = serviceBench();
      const service = await started();

      const asked = [service.stop(), service.stop()];
      await Promise.all(asked);

      expect(asked[0]).toBe(asked[1]);
      await expect(service.stopped).resolves.toBeUndefined();
    });
  });

  describe('when a start fails after it took the lock', () => {
    it('should give back the lock and the database, and listen nowhere', async () => {
      bench = serviceBench();
      const { directory } = bench.config.instance;
      const migrations = join(dirname(directory), 'migrations');
      mkdirSync(migrations);
      writeFileSync(join(migrations, 'first.sql'), 'CREATE TABLE a (b);');

      await expect(bench.run(migrations)).rejects.toThrow(
        InvalidMigrationFileError,
      );

      expect(bench.lockIsFree()).toBe(true);
      expect(existsSync(bench.config.instance.socket)).toBe(false);
      expect(existsSync(`${bench.config.instance.database}-wal`)).toBe(false);
    });
  });

  describe('when the generator has no credential', () => {
    it('should start, and say which variable it lacks', async () => {
      bench = serviceBench();
      await started();

      expect(bench.logLines()).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          fields: {
            variable: 'CLAUDE_CODE_OAUTH_TOKEN',
            billing: 'subscription',
          },
        }),
      );
    });
  });

  describe('when the generator has a credential', () => {
    it('should say nothing of it', async () => {
      bench = serviceBench({ CLAUDE_CODE_OAUTH_TOKEN: 'zz-private' });
      await started();

      expect(bench.logLines()).toEqual([]);
    });
  });
});
