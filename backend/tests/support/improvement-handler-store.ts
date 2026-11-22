import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { Transaction } from '#kernel/transaction/transaction';
import { InMemoryImprovementRepository } from '#tests/support/in-memory-improvement-repository';

/**
 * The store of improvements in memory, whose next saves a test can make
 * fail, as a database that refuses a write.
 */
export class RefusingImprovementRepository extends InMemoryImprovementRepository {
  private readonly refusals: Error[] = [];

  public refuseNextSave(error: Error): void {
    this.refusals.push(error);
  }

  public override async save(
    improvement: Improvement,
    transaction: Transaction,
  ): Promise<Improvement> {
    const refusal = this.refusals.shift();
    if (refusal !== undefined) {
      throw refusal;
    }
    return super.save(improvement, transaction);
  }
}
