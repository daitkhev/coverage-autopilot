import { EventEmitter } from 'node:events';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  serveProcess,
  type ServiceProcess,
} from '#composition/service-process';
import { WORK_WAIT } from '#tests/support/hosted-service';
import {
  askOver,
  SERVICE_VERSION,
  type ServiceBench,
  serviceBench,
} from '#tests/support/service-bench';
import { DEVELOPER } from '#tests/support/service-variables';
import { SHIPPED_IMAGE_FILE } from '#tests/support/shipped-image';
import { MIGRATIONS_FOLDER } from '#tests/support/temporary-database';

let bench: ServiceBench;
let packageFile: string;

/** The process of the bench, with what a test changes. */
function processOf(change: Partial<ServiceProcess> = {}): ServiceProcess {
  return {
    environment: bench.environment,
    user: DEVELOPER,
    migrationsFolder: MIGRATIONS_FOLDER,
    packageFile,
    generatorImageFile: SHIPPED_IMAGE_FILE,
    errors: bench.logStream,
    signals: new EventEmitter(),
    ...change,
  };
}

/**
 * Waits until the service listens for a signal, which it does last. A
 * start asks the engine and the database first, which takes seconds under
 * the load of a whole gate.
 */
async function served(signals: EventEmitter): Promise<void> {
  await vi.waitFor(() => {
    expect(signals.listenerCount('SIGTERM')).toBe(1);
  }, WORK_WAIT);
}

beforeEach(() => {
  bench = serviceBench({ CLAUDE_CODE_OAUTH_TOKEN: 'zz-private' });
  // The service makes the folder of its instance, so the file is beside it.
  packageFile = join(dirname(bench.config.instance.directory), 'package.json');
  writeFileSync(packageFile, JSON.stringify({ version: SERVICE_VERSION }));
});

afterEach(async () => {
  await bench.close();
});

describe('serveProcess', () => {
  it.each(['SIGTERM', 'SIGINT'])(
    'should serve until %s arrives, then exit with 0',
    async (signal) => {
      const signals = new EventEmitter();
      const exit = serveProcess(processOf({ signals }));
      await served(signals);
      const { socket } = bench.config.instance;

      expect(statSync(socket).isSocket()).toBe(true);

      signals.emit(signal);

      await expect(exit).resolves.toBe(0);
      expect(existsSync(socket)).toBe(false);
      expect(bench.lockIsFree()).toBe(true);
    },
  );

  it('should report the version of the package it was given', async () => {
    const signals = new EventEmitter();
    const exit = serveProcess(processOf({ signals }));
    await served(signals);

    const health = await askOver(bench.config.instance.socket, '/health');
    signals.emit('SIGTERM');
    await exit;

    expect(health.body).toMatchObject({ serviceVersion: SERVICE_VERSION });
  });

  describe('when the package of the service cannot be read', () => {
    it('should say so in one line and exit with 1', async () => {
      const missing = join(dirname(packageFile), 'no-package.json');

      await expect(
        serveProcess(processOf({ packageFile: missing })),
      ).resolves.toBe(1);
      expect(bench.logText()).toMatch(
        /^The service did not start: ENOENT[^\n]+\n$/u,
      );
    });
  });

  describe('when the system has no ids of users', () => {
    it('should refuse to start and exit with 1', async () => {
      const user = { uid: undefined, gid: undefined };

      await expect(serveProcess(processOf({ user }))).resolves.toBe(1);
      expect(bench.logText()).toMatch(/^The service did not start: /u);
    });
  });

  describe('when another service holds the instance and listens', () => {
    it('should exit with 0 at once and say why in one line', async () => {
      await bench.run();

      await expect(serveProcess(processOf())).resolves.toBe(0);
      expect(bench.logText()).toBe(
        'The service left: another service holds the instance and listens ' +
          'on its socket.\n',
      );
    });
  });

  describe('when a variable is wrong', () => {
    it('should say so in one line, without the value, and exit with 1', async () => {
      const environment = {
        ...bench.environment,
        AUTOPILOT_LOG_LEVEL: 'zz-private',
      };

      await expect(serveProcess(processOf({ environment }))).resolves.toBe(1);
      expect(bench.logText()).toBe(
        'The service did not start: The service cannot start with its ' +
          'variables. AUTOPILOT_LOG_LEVEL: expected debug, info, warn or ' +
          'error.\n',
      );
    });
  });

  describe('when the start fails after it took the lock', () => {
    it('should say so in one line, give everything back and exit with 1', async () => {
      const { directory } = bench.config.instance;
      const migrationsFolder = join(directory, 'no-migrations');

      await expect(serveProcess(processOf({ migrationsFolder }))).resolves.toBe(
        1,
      );
      const said = bench.logText();
      expect(said).toMatch(/^The service did not start: [^\n]+\n$/u);
      expect(said).not.toContain('    at ');
      expect(bench.lockIsFree()).toBe(true);
    });
  });
});
