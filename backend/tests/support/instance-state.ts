import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { InstanceLock } from '#infrastructure/database/instance-lock';
import { servicesOf } from '#tests/support/instance-services';

/** The bits of a mode that say who may read, write and enter. */
const PERMISSIONS = 0o777;

/** Where a service a client starts writes its standard error. */
const CLIENT_LOG = 'service.log';

/** What is true of an instance at one moment, seen from outside. */
export interface InstanceState {
  /** The ids of the processes of the service that run for it. */
  readonly services: readonly number[];
  /** The names of the sockets in its directory. */
  readonly sockets: readonly string[];
  /** Of the socket the service listens on, when it is there. */
  readonly socketPermissions: number | undefined;
  readonly directoryPermissions: number;
  /** Whether a process holds the instance lock. */
  readonly lockHeld: boolean;
}

/** What is true of the database of an instance, seen from outside. */
export interface DatabaseState {
  /** What `PRAGMA integrity_check` answers: `ok` alone for a sound file. */
  readonly integrity: readonly string[];
  /** The last migration it was brought to. */
  readonly version: number;
}

/**
 * Takes the lock and gives it back at once. A service that starts in
 * that moment would find it held, so it is asked only while none starts.
 */
function lockHeld(paths: InstancePaths): boolean {
  const taking = InstanceLock.take(paths.lock);
  if (taking.outcome === 'taken') {
    taking.lock.release();
  }
  return taking.outcome === 'held_by_another';
}

function socketsIn(directory: string): string[] {
  return readdirSync(directory).filter((name) =>
    lstatSync(join(directory, name)).isSocket(),
  );
}

/** The state of the instance, asked while no service of it starts. */
export function instanceStateOf(paths: InstancePaths): InstanceState {
  const socket = lstatSync(paths.socket, { throwIfNoEntry: false });
  return {
    services: servicesOf(paths.directory),
    sockets: socketsIn(paths.directory),
    socketPermissions:
      socket === undefined ? undefined : socket.mode & PERMISSIONS,
    directoryPermissions: statSync(paths.directory).mode & PERMISSIONS,
    lockHeld: lockHeld(paths),
  };
}

/**
 * The state of the database, read on a connection of its own that writes
 * nothing, beside the one of the service that runs.
 */
export function databaseStateOf(paths: InstancePaths): DatabaseState {
  const connection = new DatabaseSync(paths.database, { readOnly: true });
  try {
    const integrity = connection
      .prepare('PRAGMA integrity_check')
      .all()
      .map((row) => String(row['integrity_check']));
    const version = connection.prepare('PRAGMA user_version').get();
    return { integrity, version: Number(version?.['user_version']) };
  } finally {
    connection.close();
  }
}

/**
 * The lines the services a client started wrote to the log of the
 * instance, which the first of them makes.
 */
export function clientLogLines(paths: InstancePaths): string[] {
  const log = join(paths.directory, CLIENT_LOG);
  return existsSync(log) ? readFileSync(log, 'utf8').split('\n') : [];
}
