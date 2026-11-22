import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  serveProcess,
  type ServiceProcess,
} from '#composition/service-process';
import {
  SERVICE_VERSION,
  type ServiceBench,
  serviceBench,
} from '#tests/support/service-bench';
import { DEVELOPER } from '#tests/support/service-variables';
import { MIGRATIONS_FOLDER } from '#tests/support/temporary-database';

let bench: ServiceBench;

/** The process of the bench, with what a test changes. */
function processOf(change: Partial<ServiceProcess> = {}): ServiceProcess {
  return {
    environment: bench.environment,
    user: DEVELOPER,
    migrationsFolder: MIGRATIONS_FOLDER,
    version: SERVICE_VERSION,
    errors: bench.logStream,
    onStopRequest: () => undefined,
    ...change,
  };
}

beforeEach(() => {
  bench = serviceBench({ CLAUDE_CODE_OAUTH_TOKEN: 'zz-private' });
});

afterEach(async () => {
  await bench.close();
});

describe('serveProcess', () => {
  it('should serve until it is asked to stop, then exit with 0', async () => {
    const asked = Promise.withResolvers<() => void>();
    const exit = serveProcess(processOf({ onStopRequest: asked.resolve }));
    const stop = await asked.promise;
    const { socket } = bench.config.instance;

    expect(statSync(socket).isSocket()).toBe(true);

    stop();

    await expect(exit).resolves.toBe(0);
    expect(existsSync(socket)).toBe(false);
    expect(bench.lockIsFree()).toBe(true);
  });

  describe('when another service holds the instance', () => {
    it('should exit with 0 and say nothing', async () => {
      await bench.run();

      await expect(serveProcess(processOf())).resolves.toBe(0);
      expect(bench.logText()).toBe('');
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
