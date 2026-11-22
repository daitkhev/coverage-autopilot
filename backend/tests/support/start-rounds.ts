import { existsSync } from 'node:fs';

import { expect, vi } from 'vitest';

import {
  CONTRACT_VERSION,
  type Health,
  healthSchema,
} from '@coverage-autopilot/api-contracts/health';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { readMigrations } from '#infrastructure/database/migration-files';
import { servicesOf, signalEach } from '#tests/support/instance-services';
import {
  databaseStateOf,
  instanceStateOf,
} from '#tests/support/instance-state';
import { askOver } from '#tests/support/service-bench';
import { PROCESS_WAIT } from '#tests/support/start-race-bench';
import { MIGRATIONS_FOLDER } from '#tests/support/temporary-database';

/** Starts on one instance that settle before they are judged. */
export interface Round {
  readonly paths: InstancePaths;
  /** What a failure names, with the seed of the run. */
  readonly name: string;
}

/** The socket and the directory are their owner's alone. */
const SOCKET_PERMISSIONS = 0o600;
const DIRECTORY_PERMISSIONS = 0o700;

const SOCKET = 'service.sock';

const LAST_VERSION = readMigrations(MIGRATIONS_FOLDER).at(-1)?.version;

/**
 * The steps of a start in the order the design fixes, as each shows from
 * outside: the directory made, the lock file made, the database opened,
 * the socket bound, and the first answer on it.
 */
export const START_POINTS = [
  'directory',
  'lock',
  'database',
  'socket',
  'answer',
] as const;

type StartPoint = (typeof START_POINTS)[number];

/**
 * A start runs a step in a few milliseconds, so the test looks at once
 * again, or its crash lands long after the step.
 */
const POINT_WAIT = { timeout: PROCESS_WAIT.timeout, interval: 1 };

/** What the service on the socket of the instance answers to its health. */
export async function healthOf(paths: InstancePaths): Promise<Health> {
  const answer = await askOver(paths.socket, '/health');
  return healthSchema.parse(answer.body);
}

/** Waits until a start of the instance has come to the point. */
export async function reachedPoint(
  paths: InstancePaths,
  point: StartPoint,
): Promise<void> {
  const files: Readonly<Record<Exclude<StartPoint, 'answer'>, string>> = {
    directory: paths.directory,
    lock: paths.lock,
    database: paths.database,
    socket: paths.socket,
  };
  await vi.waitFor(async () => {
    if (point === 'answer') {
      await healthOf(paths);
    } else {
      expect(existsSync(files[point])).toBe(true);
    }
  }, POINT_WAIT);
}

/**
 * Holds what is true once the starts of a round have settled: one process
 * of the service runs for the instance and answers on its one socket,
 * which is its owner's alone, the lock is held, and the database is sound
 * and at its last migration. The health is asked again last, so the one
 * that answered is still the one that serves.
 */
export async function expectOneServes(round: Round): Promise<Health> {
  const { paths, name } = round;
  const health = await vi.waitFor(async () => healthOf(paths), PROCESS_WAIT);
  await vi.waitFor(() => {
    expect(servicesOf(paths.directory), name).toHaveLength(1);
  }, PROCESS_WAIT);
  expect(instanceStateOf(paths), name).toEqual({
    services: [expect.any(Number)],
    sockets: [SOCKET],
    socketPermissions: SOCKET_PERMISSIONS,
    directoryPermissions: DIRECTORY_PERMISSIONS,
    lockHeld: true,
  });
  expect(databaseStateOf(paths), name).toEqual({
    integrity: ['ok'],
    brokenReferences: [],
    version: LAST_VERSION,
  });
  expect(health, name).toMatchObject({
    ready: true,
    contractVersion: CONTRACT_VERSION,
    worker: { alive: true },
  });
  await expect(healthOf(paths), name).resolves.toMatchObject({
    startedAt: health.startedAt,
  });
  return health;
}

/**
 * Stops the one service of the instance and holds what it leaves once it
 * is gone: the lock free, so it was the one that held it, and its socket
 * file after a crash, on which nothing answers, and none after a clean
 * stop.
 */
export async function stopTheOneServing(
  round: Round,
  signal: NodeJS.Signals,
): Promise<void> {
  const { paths, name } = round;
  const serving = servicesOf(paths.directory);
  expect(serving, name).toHaveLength(1);
  signalEach(serving, signal);
  await vi.waitFor(() => {
    expect(servicesOf(paths.directory), name).toEqual([]);
  }, PROCESS_WAIT);
  const crashed = signal === 'SIGKILL';
  expect(instanceStateOf(paths), name).toMatchObject({
    lockHeld: false,
    sockets: crashed ? [SOCKET] : [],
  });
  if (crashed) {
    await expect(healthOf(paths), name).rejects.toThrow(/ECONNREFUSED/u);
  }
}
