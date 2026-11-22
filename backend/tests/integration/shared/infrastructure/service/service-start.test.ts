import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
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

/** What a start was asked to wait, and what happens at each pause. */
interface Pauses {
  readonly asked: number[];
  /** Runs at a pause, before it ends. */
  during: () => Promise<void>;
}

let instance: InstanceFolder;
let paths: InstancePaths;
let config: ServiceConfig;
let holders: ChildProcess[];
let servers: Server[];
let starts: ServiceStart[];
let pauses: Pauses;

async function start(
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<ServiceStart> {
  const started = await startService(config, migrationsFolder, async (ms) => {
    pauses.asked.push(ms);
    await pauses.during();
  });
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

/** A service that holds the lock, and listens on the socket when asked. */
async function anotherService(socket?: string): Promise<ChildProcess> {
  prepareInstanceDirectory(paths);
  const holder = await startLockHolder(paths.lock, socket);
  holders.push(holder);
  return holder;
}

async function listenOnTheSocket(): Promise<void> {
  const server = createServer((socket) => socket.end());
  servers.push(server);
  await once(server.listen(paths.socket), 'listening');
}

function pausedMs(): number {
  return pauses.asked.reduce((sum, ms) => sum + ms, 0);
}

beforeEach(() => {
  instance = createInstanceFolder();
  paths = instance.paths;
  config = loadWith({ AUTOPILOT_INSTANCE_DIR: paths.directory });
  holders = [];
  servers = [];
  starts = [];
  pauses = { asked: [], during: async () => Promise.resolve() };
});

afterEach(async () => {
  for (const holder of holders) {
    await crash(holder);
  }
  for (const server of servers) {
    server.close();
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
  it('should hold the lock and give the database at its last migration', async () => {
    const started = await start();

    expect(started.outcome).toBe('started');
    expect(
      started.outcome === 'started' &&
        started.connection.prepare('PRAGMA user_version').get(),
    ).toEqual({ user_version: readMigrations(MIGRATIONS_FOLDER).length });
    expect(statSync(paths.directory).mode & 0o777).toBe(0o700);
    expect(lockIsFree()).toBe(false);
    expect(pauses.asked).toEqual([]);
  });

  describe('when a killed service left its socket', () => {
    it('should start and remove the socket', async () => {
      await crash(await anotherService(paths.socket));

      expect((await start()).outcome).toBe('started');
      expect(existsSync(paths.socket)).toBe(false);
    });
  });

  describe('when another service holds the lock and listens', () => {
    it('should answer held_by_another at once and touch no file of it', async () => {
      await anotherService(paths.socket);

      expect(await start()).toEqual({ outcome: 'held_by_another' });
      expect(pauses.asked).toEqual([]);
      expect(existsSync(paths.database)).toBe(false);
      expect(lstatSync(paths.socket).isSocket()).toBe(true);
    });
  });

  describe('when a service on its way out holds the lock with no socket', () => {
    it('should wait until it gives the lock back, and start', async () => {
      const leaving = await anotherService();
      pauses.during = async () => {
        await crash(leaving);
      };

      const started = await start();

      expect(started.outcome).toBe('started');
      expect(pauses.asked).toEqual([50]);
      expect(lockIsFree()).toBe(false);
    });
  });

  describe('when the holder begins to listen during the wait', () => {
    it('should answer held_by_another and leave it the instance', async () => {
      await anotherService();
      pauses.during = listenOnTheSocket;

      expect(await start()).toEqual({ outcome: 'held_by_another' });
      expect(pauses.asked).toEqual([50]);
      expect(existsSync(paths.database)).toBe(false);
    });
  });

  describe('when the holder keeps the lock for the whole wait', () => {
    it('should give up after 5 seconds and touch no file of it', async () => {
      await anotherService();

      expect(await start()).toEqual({ outcome: 'held_without_socket' });
      expect(pausedMs()).toBe(5_000);
      expect(existsSync(paths.database)).toBe(false);
      expect(lockIsFree()).toBe(false);
    });
  });

  describe('when a migration cannot be read', () => {
    it('should throw, close the database and give the lock back', async () => {
      const folder = join(paths.directory, '..', 'migrations');
      mkdirSync(folder);
      writeFileSync(join(folder, 'first.sql'), 'SELECT 1;');

      await expect(start(folder)).rejects.toThrow(InvalidMigrationFileError);
      expect(databaseIsClosed()).toBe(true);
      expect(lockIsFree()).toBe(true);
    });
  });

  describe('when the database cannot be opened', () => {
    it('should throw and give the lock back', async () => {
      mkdirSync(paths.database, { recursive: true });

      await expect(start()).rejects.toThrow('unable to open database file');
      expect(lockIsFree()).toBe(true);
    });
  });

  describe('when something that is not a socket is where it listens', () => {
    it('should throw after it migrated, and give back what it took', async () => {
      prepareInstanceDirectory(paths);
      writeFileSync(paths.socket, 'notes\n');

      await expect(start()).rejects.toThrow(SocketPathTakenError);
      expect(databaseIsClosed()).toBe(true);
      expect(lockIsFree()).toBe(true);
      expect(statSync(paths.database).size).toBeGreaterThan(0);
    });
  });
});
