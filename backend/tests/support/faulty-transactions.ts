import type { Transaction } from '#kernel/transaction/transaction';
import type { TransactionManager } from '#ports/transaction-manager.port';

/**
 * The real transaction manager, in front of which a test can make the
 * database refuse the next transactions, at the point the test names.
 */
export class FaultyTransactions implements TransactionManager {
  private readonly inner: TransactionManager;
  private refusals = 0;

  public constructor(inner: TransactionManager) {
    this.inner = inner;
  }

  /** The next transaction fails before it begins, as on a busy database. */
  public refuseNext(): void {
    this.refusals += 1;
  }

  public async run<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    if (this.refusals > 0) {
      this.refusals -= 1;
      return Promise.reject(new Error('database is locked'));
    }
    return this.inner.run(operation);
  }
}
