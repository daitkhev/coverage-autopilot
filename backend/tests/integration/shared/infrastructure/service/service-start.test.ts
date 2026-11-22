import type { ChildProcess } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import type { ServiceConfig } from '#infrastructure/config/service-config';
import { InvalidMigrationFileError } from '#infrastructure/database/errors/invalid-migration-file.error';
import { InstanceLock } from '#infrastructure/database/instance-lock';
import { readMigrations } from '#infrastructure/database/migration-files';
import { SocketPathTakenError } from '#infrastructure/service/errors/socket-path-taken.error';
import { prepareInstanceDirectory } from '#infrastructure/service/instance-directory';
import {
  type ServiceStart,
  startService,
} from '#infrastructure/service/service-start';
import {
  createInstanceFolder,
  type InstanceFolder,
} from '#tests/support/instance-folder';
import { crash, startLockHolder } from '#tests/support/lock-holder';
import { loadWith } from '#tests/support/service-variables';
import { MIGRATIONS_FOLDER } from '#tests/support/temporary-database';

let instance: InstanceFolder;
let paths: InstancePaths;
let config: ServiceConfig;
let holders: ChildProcess[];
let starts: ServiceStart[];

function start(migrationsFolder = MIGRATIONS_FOLDER): ServiceStart {
  const started = startService(config, migrationsFolder);
  starts.push(started);
  return started;
}

/** Whether a start could take the lock now, which it then gives back. */
function lockIsFree(): boolean {
  const taking = InstanceLock.take(paths.lock);
  if (taking.outcome === 'taken') {
    taking.lock.release();
  }
  return taking.outcome === 'taken';
}

/** SQLite removes the log of the database when its last connection closes. */
function databaseIsClosed(): boolean {
  return !existsSync(`${paths.database}-wal`);
}

async function anotherService(): Promise<ChildProcess> {
  prepareInstanceDirectory(paths);
  const holder = await startLockHolder(paths.lock, paths.socket);
  holders.push(holder);
  return holder;
}

beforeEach(() => {
  instance = createInstanceFolder();
  paths = instance.paths;
  config = loadWith({ AUTOPILOT_INSTANCE_DIR: paths.directory });
  holders = [];
  starts = [];
});

afterEach(async () => {
  for (const holder of holders) {
    await crash(holder);
  }
  for (const started of starts) {
    if (started.outcome === 'started') {
      started.connection.close();
      started.lock.release();
    }
  }
  instance.remove();
});

describe('startService', () => {
  it('should hold the lock and give the database at its last migration', () => {
    const started = start();

    expect(started.outcome).toBe('started');
    expect(
      started.outcome === 'started' &&
        started.connection.prepare('PRAGMA user_version').get(),
    ).toEqual({ user_version: readMigrations(MIGRATIONS_FOLDER).length });
    expect(statSync(paths.directory).mode & 0o777).toBe(0o700);
    expect(lockIsFree()).toBe(false);
  });

  describe('when a killed service left its socket', () => {
    it('should start and remove the socket', async () => {
      await crash(await anotherService());

      expect(start().outcome).toBe('started');
      expect(existsSync(paths.socket)).toBe(false);
    });
  });

  describe('when another service holds the lock', () => {
    it('should answer held_by_another and touch no file of it', async () => {
      await anotherService();

      expect(start()).toEqual({ outcome: 'held_by_another' });
      expect(existsSync(paths.database)).toBe(false);
      expect(lstatSync(paths.socket).isSocket()).toBe(true);
    });
  });

  describe('when a migration cannot be read', () => {
    it('should throw, close the database and give the lock back', () => {
      const folder = join(paths.directory, '..', 'migrations');
      mkdirSync(folder);
      writeFileSync(join(folder, 'first.sql'), 'SELECT 1;');

      expect(() => start(folder)).toThrow(InvalidMigrationFileError);
      expect(databaseIsClosed()).toBe(true);
      expect(lockIsFree()).toBe(true);
    });
  });

  describe('when the database cannot be opened', () => {
    it('should throw and give the lock back', () => {
      mkdirSync(paths.database, { recursive: true });

      expect(() => start()).toThrow('unable to open database file');
      expect(lockIsFree()).toBe(true);
    });
  });

  describe('when something that is not a socket is where it listens', () => {
    it('should throw after it migrated, and give back what it took', () => {
      prepareInstanceDirectory(paths);
      writeFileSync(paths.socket, 'notes\n');

      expect(() => start()).toThrow(SocketPathTakenError);
      expect(databaseIsClosed()).toBe(true);
      expect(lockIsFree()).toBe(true);
      expect(statSync(paths.database).size).toBeGreaterThan(0);
    });
  });
});
