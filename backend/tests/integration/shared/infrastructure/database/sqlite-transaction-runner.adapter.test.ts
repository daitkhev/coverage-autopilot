import { DatabaseSync } from 'node:sqlite';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidTransactionError } from '#infrastructure/database/errors/invalid-transaction.error';
import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import type { Transaction } from '#kernel/transaction/transaction';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import {
  createEmptyDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

let database: TemporaryDatabase;
let manager: TransactionManager;

function insert(transaction: Transaction, value: string): void {
  SqliteTransaction.connectionOf(transaction)
    .prepare('INSERT INTO notes (value) VALUES (?)')
    .run(value);
}

function notes(): string[] {
  return database.connection
    .prepare('SELECT value FROM notes ORDER BY rowid')
    .all()
    .map((row) => String(row['value']));
}

beforeEach(async () => {
  database = createEmptyDatabase();
  database.connection.exec('CREATE TABLE notes (value TEXT NOT NULL) STRICT');
  const module = await Test.createTestingModule({
    providers: [
      { provide: SQLITE_CONNECTION, useValue: database.connection },
      { provide: TRANSACTION_MANAGER, useClass: SqliteTransactionRunner },
    ],
  }).compile();
  manager = module.get<TransactionManager>(TRANSACTION_MANAGER);
});

afterEach(() => {
  database.remove();
});

describe('SqliteTransactionRunner', () => {
  describe('run', () => {
    it('should commit what the operation wrote and return its value', async () => {
      const value = await manager.run(async (transaction) => {
        insert(transaction, 'a');
        return Promise.resolve('done');
      });

      expect(value).toBe('done');
      expect(notes()).toEqual(['a']);
      expect(database.connection.isTransaction).toBe(false);
    });

    it('should hold the write lock of the database from the start', async () => {
      const other = new DatabaseSync(database.path, { timeout: 0 });

      await manager.run(async () => {
        expect(() => {
          other.exec('BEGIN IMMEDIATE');
        }).toThrow('database is locked');
        return Promise.resolve();
      });
      other.close();
    });

    describe('when the operation throws', () => {
      it('should roll back and throw the same error', async () => {
        const failure = new Error('stop');

        await expect(
          manager.run(async (transaction) => {
            insert(transaction, 'a');
            return Promise.reject(failure);
          }),
        ).rejects.toBe(failure);
        expect(notes()).toEqual([]);
        expect(database.connection.isTransaction).toBe(false);
      });
    });

    describe('when SQLite has rolled back already', () => {
      it('should throw the error of the commit and stay usable', async () => {
        await expect(
          manager.run(async () => {
            database.connection.exec('ROLLBACK');
            return Promise.resolve();
          }),
        ).rejects.toThrow('no transaction is active');

        await manager.run(async (transaction) => {
          insert(transaction, 'b');
          return Promise.resolve();
        });
        expect(notes()).toEqual(['b']);
      });
    });

    describe('when two callers run at the same time', () => {
      it('should run one transaction after the other', async () => {
        const order: string[] = [];
        const slow = Promise.withResolvers<undefined>();

        const first = manager.run(async (transaction) => {
          order.push('first starts');
          insert(transaction, 'first');
          await slow.promise;
          order.push('first ends');
        });
        const second = manager.run(async (transaction) => {
          order.push('second starts');
          insert(transaction, 'second');
          return Promise.resolve();
        });
        slow.resolve(undefined);
        await Promise.all([first, second]);

        expect(order).toEqual(['first starts', 'first ends', 'second starts']);
        expect(notes()).toEqual(['first', 'second']);
      });

      it('should run the next one after a failed one', async () => {
        const failed = manager.run(async () => Promise.reject(new Error('x')));
        const next = manager.run(async (transaction) => {
          insert(transaction, 'next');
          return Promise.resolve();
        });

        await expect(failed).rejects.toThrow('x');
        await next;
        expect(notes()).toEqual(['next']);
      });
    });
  });
});

describe('SqliteTransaction', () => {
  describe('connectionOf', () => {
    describe('when the transaction has ended', () => {
      it('should throw InvalidTransactionError', async () => {
        const kept = await manager.run(async (transaction) =>
          Promise.resolve(transaction),
        );

        expect(() => {
          insert(kept, 'late');
        }).toThrow(
          new InvalidTransactionError(
            'The transaction has ended. A handle is used inside its ' +
              'operation only.',
          ),
        );
        expect(notes()).toEqual([]);
      });
    });

    describe('when another manager made the transaction', () => {
      it('should throw InvalidTransactionError', async () => {
        await manager.run(async (transaction) => {
          const foreign: Transaction = { ...transaction };

          expect(() => SqliteTransaction.connectionOf(foreign)).toThrow(
            InvalidTransactionError,
          );
          return Promise.resolve();
        });
      });
    });
  });
});
