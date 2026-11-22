import { DatabaseSync } from 'node:sqlite';

import { InstanceLockReleasedError } from '#infrastructure/database/errors/instance-lock-released.error';
import { UnusableLockFileError } from '#infrastructure/database/errors/unusable-lock-file.error';

/** The lock, or, as a value, that another service holds it. */
export type InstanceLockTaking =
  | { readonly outcome: 'taken'; readonly lock: InstanceLock }
  | { readonly outcome: 'held_by_another' };

/**
 * A second service is refused at once. Waiting would only delay the same
 * answer, since the holder keeps the lock for its whole life.
 */
const NO_WAIT_MS = 0;

/** The code SQLite gives when another connection holds the file. */
const BUSY = 5;

function isBusy(error: unknown): boolean {
  return error instanceof Error && 'errcode' in error && error.errcode === BUSY;
}

function unusable(path: string, error: unknown): UnusableLockFileError {
  return new UnusableLockFileError(
    `The file of the instance lock ${path} cannot be used: ${String(error)}`,
    { cause: error },
  );
}

function openLockFile(path: string): DatabaseSync {
  try {
    return new DatabaseSync(path, { timeout: NO_WAIT_MS });
  } catch (error) {
    throw unusable(path, error);
  }
}

/**
 * The lock of the one service of an instance: an exclusive transaction on
 * a SQLite file of its own, on a connection of its own. It is not the
 * database, so the transaction that lasts as long as the process blocks
 * nothing. SQLite lets go of it when the process ends in any way, also
 * after `SIGKILL`, so a crash leaves no lock behind. The holder keeps a
 * reference to it: a lock the garbage collector takes closes its
 * connection, and with it the lock.
 */
export class InstanceLock {
  private readonly connection: DatabaseSync;

  private constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  /**
   * Takes the lock of the file at `path`, which is made when it is missing
   * and never deleted: deleting it would let the next two services lock
   * two different files.
   */
  public static take(path: string): InstanceLockTaking {
    const connection = openLockFile(path);
    try {
      connection.exec('BEGIN EXCLUSIVE');
    } catch (error) {
      connection.close();
      if (isBusy(error)) {
        return { outcome: 'held_by_another' };
      }
      throw unusable(path, error);
    }
    return { outcome: 'taken', lock: new InstanceLock(connection) };
  }

  /** Throws unless the lock is still held, since only its holder may act. */
  public confirmHeld(): void {
    if (!this.connection.isOpen) {
      throw new InstanceLockReleasedError(
        'The instance lock was released, so another service may hold it now.',
      );
    }
  }

  /** For a clean stop and for tests. A second release does nothing. */
  public release(): void {
    if (this.connection.isOpen) {
      this.connection.close();
    }
  }
}
