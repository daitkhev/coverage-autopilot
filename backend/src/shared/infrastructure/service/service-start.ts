import type { ServiceConfig } from '#infrastructure/config/service-config';
import { InstanceLock } from '#infrastructure/database/instance-lock';
import { readMigrations } from '#infrastructure/database/migration-files';
import { openSqliteConnection } from '#infrastructure/database/sqlite-connection';
import { migrateDatabase } from '#infrastructure/database/sqlite-migrator';
import { prepareInstanceDirectory } from '#infrastructure/service/instance-directory';
import { removeStaleSocket } from '#infrastructure/service/service-socket';

/**
 * The driver of SQLite is named only where SQL runs. The start hands the
 * connection on and runs none.
 */
export type ServiceConnection = ReturnType<typeof openSqliteConnection>;

/** What the entry file goes on with, or, as a value, that it should exit. */
export type ServiceStart =
  | {
      readonly outcome: 'started';
      /** Kept for the life of the process, and released at a clean stop. */
      readonly lock: InstanceLock;
      /** The one connection of the process, migrated and checked. */
      readonly connection: ServiceConnection;
    }
  | { readonly outcome: 'held_by_another' };

/**
 * The steps of a start up to listening, in their fixed order, the same on
 * a clean start and after a crash: the instance lock, then the database
 * brought to the last migration and checked, and only then the removal of
 * a socket a crashed service left. No other connection is open while the
 * database migrates. A step that fails gives back what the steps before it
 * took and throws, so the next start begins from the same place.
 */
export function startService(
  config: ServiceConfig,
  migrationsFolder: string,
): ServiceStart {
  const paths = config.instance;
  prepareInstanceDirectory(paths);
  const taking = InstanceLock.take(paths.lock);
  if (taking.outcome === 'held_by_another') {
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
