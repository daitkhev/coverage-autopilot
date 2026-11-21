import type { Transaction } from '#kernel/transaction/transaction';
import type { TransactionManager } from '#ports/transaction-manager.port';

/**
 * A transaction manager in memory: it runs the operation at once with one
 * handle, which a test compares with what a store was given.
 */
export class InlineTransactions implements TransactionManager {
  public readonly transaction = Object.freeze({}) as unknown as Transaction;
  public runs = 0;

  public async run<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    this.runs += 1;
    return operation(this.transaction);
  }
}
