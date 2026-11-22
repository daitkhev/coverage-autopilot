import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import { GetImprovementHandler } from '#improvement/application/queries/get-improvement/get-improvement.handler';
import { ListImprovementsHandler } from '#improvement/application/queries/list-improvements/list-improvements.handler';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { FixedClock } from '#tests/support/fixed-clock';
import { minutesIn } from '#tests/support/improvement-values';
import { InMemoryImprovementRepository } from '#tests/support/in-memory-improvement-repository';
import { InlineTransactions } from '#tests/support/inline-transactions';
import { recordingQueue } from '#tests/support/recording-queue';

/** After every step of a journey of the tests, and before its deadline. */
const NOW_MINUTE = 10;

/**
 * What a person asks of improvements, over stand-ins in memory: a store,
 * transactions, a queue and a clock that stands still ten minutes after
 * the journeys began. A test sets their answers and reads what each was
 * asked.
 */
export class ImprovementRequestWorld {
  public readonly improvements = new InMemoryImprovementRepository();
  public readonly transactions = new InlineTransactions();
  public readonly queue = recordingQueue();
  public readonly clock = new FixedClock(minutesIn(NOW_MINUTE).toString());
  public readonly views = new ImprovementViews(this.queue, this.clock);

  public readonly getImprovement = new GetImprovementHandler(
    this.improvements,
    this.views,
  );
  public readonly listImprovements = new ListImprovementsHandler(
    this.improvements,
    this.views,
  );

  /** Stores improvements made before the test, and forgets the writes. */
  public async stored(...improvements: Improvement[]): Promise<void> {
    for (const improvement of improvements) {
      await this.improvements.insert(
        improvement,
        this.transactions.transaction,
      );
    }
    this.improvements.writes.length = 0;
  }
}
