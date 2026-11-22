import { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { FixedClock } from '#tests/support/fixed-clock';
import { IMPROVEMENT_ID, minutesIn } from '#tests/support/improvement-values';
import { InMemoryImprovementRepository } from '#tests/support/in-memory-improvement-repository';
import { StandInJobContext } from '#tests/support/stand-in-job-context';

/** After every step of a journey of the tests, and before its deadline. */
const RUN_MINUTE = 10;

/**
 * What a step of an improvement runs on in a test: a store in memory, a
 * clock that stands still ten minutes after the creation, and the context
 * of a leased job.
 */
export class ImprovementRunBench {
  public readonly clock = new FixedClock(minutesIn(RUN_MINUTE).toString());
  public readonly improvements = new InMemoryImprovementRepository();
  public readonly context = new StandInJobContext(IMPROVEMENT_ID);

  /** Stores the improvement and gives a run of it, as a handler would. */
  public async runOf(improvement: Improvement): Promise<ImprovementRun> {
    await this.improvements.insert(
      improvement,
      this.context.transactions.transaction,
    );
    return new ImprovementRun(improvement, {
      context: this.context,
      signal: this.context.signal,
      improvements: this.improvements,
      clock: this.clock,
    });
  }

  /** The improvement as the store keeps it now. */
  public async stored(): Promise<Improvement> {
    const [stored] = await this.improvements.list({});
    if (stored === undefined) {
      throw new Error('The bench stores no improvement yet.');
    }
    return stored;
  }
}
