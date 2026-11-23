import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  healthSchema,
} from '@coverage-autopilot/api-contracts/health';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';

import { socketServiceApi } from '#api/socket-service-api';

/** The program of the built package, which the gate builds before this runs. */
const CLIENT = fileURLToPath(
  new URL('../../../dist/bin/client.js', import.meta.url),
);

/** Short enough for a socket: the temporary folder of macOS is not. */
const SHORT_ROOT = '/tmp';

/**
 * Where the service keeps its instance and its socket under a home. The
 * client repeats these names, and this test holds the two together: the
 * service makes the files, the client finds them.
 */
const INSTANCE_FOLDER = '.coverage-autopilot';
const SOCKET_FILE = 'service.sock';

const DONE = 0;
const WRONG_LINE = 2;

const PATIENT = { timeout: 30_000, interval: 50 } as const;

/** A folder of a service that just stopped may still be written to. */
const REMOVAL = { recursive: true, force: true, maxRetries: 5 } as const;

describe('the built client', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(SHORT_ROOT, 'client-'));
  });

  afterEach(async () => {
    const socket = join(home, INSTANCE_FOLDER, SOCKET_FILE);
    if (existsSync(socket)) {
      await socketServiceApi(socket).stopService();
      await expect.poll(() => existsSync(socket), PATIENT).toBe(false);
    }
    rmSync(home, REMOVAL);
  });

  /** One run of the program, with nothing of the test's own environment. */
  function run(...line: readonly string[]) {
    return spawnSync(process.execPath, [CLIENT, ...line], {
      env: { PATH: '/usr/bin:/bin', HOME: home },
      encoding: 'utf8',
    });
  }

  it('should print its help and end with 0', () => {
    const { status, stdout, stderr } = run('--help');

    expect(status).toBe(DONE);
    expect(stdout).toContain('Usage: coverage-autopilot');
    expect(stderr).toBe('');
  });

  it('should end with 2 for a line it cannot read', () => {
    const { status, stdout, stderr } = run('scan');

    expect(status).toBe(WRONG_LINE);
    expect(stdout).toBe('');
    expect(stderr).toContain('scan <repo>');
  });

  it('should print its help and end with 2 without a terminal', () => {
    const { status, stderr } = run();

    expect(status).toBe(WRONG_LINE);
    expect(stderr).toContain('Usage: coverage-autopilot');
  });

  describe('when no service runs', () => {
    it('should start the built service where the service keeps itself', () => {
      const first = run('repo', 'list', '--json');

      expect(first.stderr).toBe('Starting the service\n');
      expect(first.stdout).toBe('{"items":[]}\n');
      expect(first.status).toBe(DONE);
      expect(existsSync(join(home, INSTANCE_FOLDER, SOCKET_FILE))).toBe(true);
    });

    it('should use that service for the next command', () => {
      run('repo', 'list');

      const next = run('doctor', '--json');

      expect(next.stderr).toBe('');
      expect(next.status).toBe(DONE);
      const health = parseAs(healthSchema, JSON.parse(next.stdout));
      expect(health.contractVersion).toBe(CONTRACT_VERSION);
      expect(health.ready).toBe(true);
    });
  });

  describe('when it is asked for a service of its own', () => {
    it('should run the command and leave no service behind', () => {
      const { status, stdout, stderr } = run('doctor', '--isolated', '--json');

      expect(stderr).toBe('Starting the service\n');
      expect(status).toBe(DONE);
      expect(parseAs(healthSchema, JSON.parse(stdout)).ready).toBe(true);
      expect(existsSync(join(home, INSTANCE_FOLDER))).toBe(false);
    });
  });
});
