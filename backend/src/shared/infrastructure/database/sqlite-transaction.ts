import type { DatabaseSync } from 'node:sqlite';

import { InvalidTransactionError } from '#infrastructure/database/errors/invalid-transaction.error';
import type { Transaction } from '#kernel/transaction/transaction';

/**
 * What stands behind a `Transaction` of SQLite. It is closed when its
 * transaction ends, so a handle kept past that point cannot write outside
 * the transaction it was given for.
 */
export class SqliteTransaction {
  private readonly connection: DatabaseSync;
  private open = true;

  public constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  /** The connection a persistence adapter runs its statements on. */
  public static connectionOf(transaction: Transaction): DatabaseSync {
    const handle: unknown = transaction;
    if (!(handle instanceof SqliteTransaction)) {
      throw new InvalidTransactionError(
        'The transaction was not made by the SQLite transaction manager.',
      );
    }
    if (!handle.open) {
      throw new InvalidTransactionError(
        'The transaction has ended. A handle is used inside its operation only.',
      );
    }
    return handle.connection;
  }

  public get handle(): Transaction {
    return this as unknown as Transaction;
  }

  public close(): void {
    this.open = false;
  }
}
