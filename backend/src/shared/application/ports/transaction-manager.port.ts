import type { Transaction } from '#kernel/transaction/transaction';

/**
 * Runs an operation in one write transaction of the database: it commits
 * when the operation returns and rolls back when it throws. Callers in one
 * process take turns, so two operations never share a transaction.
 *
 * The operation holds database statements only. Cloning, a test run or
 * the AI CLI inside it would keep every other writer waiting. It passes
 * the transaction on and never starts another one, which would wait for
 * itself.
 */
export interface TransactionManager {
  run<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T>;
}

/** The injection token of the transaction manager. */
export const TRANSACTION_MANAGER = Symbol('TransactionManager');
