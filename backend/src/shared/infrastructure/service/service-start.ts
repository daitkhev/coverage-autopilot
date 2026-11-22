import type { InstancePaths } from '#infrastructure/config/instance-paths';
import type { ServiceConfig } from '#infrastructure/config/service-config';
import { InstanceLock } from '#infrastructure/database/instance-lock';
import { readMigrations } from '#infrastructure/database/migration-files';
import { openSqliteConnection } from '#infrastructure/database/sqlite-connection';
import { migrateDatabase } from '#infrastructure/database/sqlite-migrator';
import { prepareInstanceDirectory } from '#infrastructure/service/instance-directory';
import {
  removeStaleSocket,
  socketIsThere,
} from '#infrastructure/service/service-socket';
import type { Pause } from '#infrastructure/time/timer-pause';

/**
 * The driver of SQLite is named only where SQL runs. The start hands the
 * connection on and runs none.
 */
export type ServiceConnection = ReturnType<typeof openSqliteConnection>;

/**
 * Why a start leaves the instance to the service that holds its lock:
 * that service listens on the socket, or it held the lock for the whole
 * wait and did not listen.
 */
export type HeldOutcome = 'held_by_another' | 'held_without_socket';

/** What the entry file goes on with, or, as a value, that it should exit. */
export type ServiceStart =
  | {
      readonly outcome: 'started';
      /** Kept for the life of the process, and released at a clean stop. */
      readonly lock: InstanceLock;
      /** The one connection of the process, migrated and checked. */
      readonly connection: ServiceConnection;
    }
  | { readonly outcome: HeldOutcome };

type LockTaking =
  | { readonly outcome: 'taken'; readonly lock: InstanceLock }
  | { readonly outcome: HeldOutcome };

/**
 * A service on its way out removes its socket a moment before it gives
 * back its lock, as its server closes before its database. A start that
 * meets it waits this long for the lock, and looks this often.
 */
const LOCK_WAIT_MS = 5_000;
const LOOK_INTERVAL_MS = 50;
const PAUSES = Math.ceil(LOCK_WAIT_MS / LOOK_INTERVAL_MS);

/** The lock, or who holds it as far as the socket tells. */
function lookAtLock(paths: InstancePaths): LockTaking {
  const taking = InstanceLock.take(paths.lock);
  if (taking.outcome === 'taken') {
    return taking;
  }
  return socketIsThere(paths.socket)
    ? { outcome: 'held_by_another' }
    : { outcome: 'held_without_socket' };
}

/**
 * The lock once it is free. A holder that listens answers the clients,
 * so the start leaves it at once. A holder with no socket is on its way
 * out, or still on its way to listen, so the start looks again after
 * each pause, up to the whole wait.
 */
async function takeLock(
  paths: InstancePaths,
  pause: Pause,
): Promise<LockTaking> {
  let taking = lookAtLock(paths);
  for (
    let paused = 0;
    taking.outcome === 'held_without_socket' && paused < PAUSES;
    paused += 1
  ) {
    await pause(LOOK_INTERVAL_MS);
    taking = lookAtLock(paths);
  }
  return taking;
}

/**
 * The steps of a start up to listening, in their fixed order, the same on
 * a clean start and after a crash: the instance lock, then the database
 * brought to the last migration and checked, and only then the removal of
 * a socket a crashed service left. No other connection is open while the
 * database migrates. A step that fails gives back what the steps before it
 * took and throws, so the next start begins from the same place.
 */
export async function startService(
  config: ServiceConfig,
  migrationsFolder: string,
  pause: Pause,
): Promise<ServiceStart> {
  const paths = config.instance;
  prepareInstanceDirectory(paths);
  const taking = await takeLock(paths, pause);
  if (taking.outcome !== 'taken') {
    return taking;
  }
  const { lock } = taking;
  let connection: ServiceConnection | undefined;
  try {
    connection = openSqliteConnection(paths.database);
    migrateDatabase(connection, readMigrations(migrationsFolder));
    removeStaleSocket(lock, paths.socket);
    return { outcome: 'started', lock, connection };
  } catch (error) {
    connection?.close();
    lock.release();
    throw error;
  }
}
