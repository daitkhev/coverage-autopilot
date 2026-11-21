import type { DatabaseSync } from 'node:sqlite';

import { Inject, Injectable } from '@nestjs/common';

import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import type { Transaction } from '#kernel/transaction/transaction';
import type { TransactionManager } from '#ports/transaction-manager.port';

/**
 * The transaction manager over the one SQLite connection of a process.
 *
 * A transaction of SQLite belongs to its connection, not to the caller.
 * While one operation awaits, another caller would write into the same
 * open transaction, so callers wait for their turn here. `BEGIN IMMEDIATE`
 * takes the write lock at once: a deferred transaction that reads first
 * can fail when it tries to write and another process already does.
 */
@Injectable()
export class SqliteTransactionRunner implements TransactionManager {
  private readonly connection: DatabaseSync;
  private lastTurn: Promise<void> = Promise.resolve();

  public constructor(@Inject(SQLITE_CONNECTION) connection: DatabaseSync) {
    this.connection = connection;
  }

  public async run<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.lastTurn;
    const turn = Promise.withResolvers<undefined>();
    this.lastTurn = turn.promise;
    await previous;
    try {
      return await this.inTransaction(operation);
    } finally {
      turn.resolve(undefined);
    }
  }

  private async inTransaction<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    this.connection.exec('BEGIN IMMEDIATE');
    const transaction = new SqliteTransaction(this.connection);
    try {
      const value = await operation(transaction.handle);
      this.connection.exec('COMMIT');
      return value;
    } catch (error) {
      this.rollBack();
      throw error;
    } finally {
      transaction.close();
    }
  }

  /** SQLite has already rolled back after some errors, such as a full disk. */
  private rollBack(): void {
    if (this.connection.isTransaction) {
      this.connection.exec('ROLLBACK');
    }
  }
}
