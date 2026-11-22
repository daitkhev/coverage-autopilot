import { RunImprovementHandler } from '#improvement/application/commands/run-improvement/run-improvement.handler';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';
import type { JobResult } from '#ports/job-handler.port';
import { FixedClock } from '#tests/support/fixed-clock';
import { ManualAlarm } from '#tests/support/improvement-handler-alarm';
import { ScriptedStep } from '#tests/support/improvement-handler-step';
import { RefusingImprovementRepository } from '#tests/support/improvement-handler-store';
import {
  IMPROVEMENT_ID,
  improvementIdOf,
  minutesIn,
} from '#tests/support/improvement-values';
import { InlineTransactions } from '#tests/support/inline-transactions';
import { RecordingLogger } from '#tests/support/recording-logger';
import { StandInJobContext } from '#tests/support/stand-in-job-context';

/** After every step of a journey of the tests, and before its deadline. */
const RUN_MINUTE = 10;

/**
 * The handler of improvement jobs over a store in memory, with a scripted
 * step for each status that works, an alarm a test rings, a clock that
 * stands still ten minutes after the creation, and the context of a
 * leased job.
 */
export class ImprovementHandlerBench {
  public readonly clock = new FixedClock(minutesIn(RUN_MINUTE).toString());
  public readonly improvements = new RefusingImprovementRepository();
  public readonly context = new StandInJobContext(IMPROVEMENT_ID);
  public readonly alarm = new ManualAlarm();
  public readonly transactions = new InlineTransactions();
  /** Every line the handler wrote. */
  public readonly logger = new RecordingLogger();
  public readonly steps = [
    new ScriptedStep('analyzing', 'verification_error'),
    new ScriptedStep('generating', 'generator_unavailable'),
    new ScriptedStep('verifying', 'verification_error'),
    new ScriptedStep('publishing', 'publish_failed'),
  ];

  public handler(): RunImprovementHandler {
    return new RunImprovementHandler(
      this.improvements,
      this.steps,
      this.clock,
      this.alarm,
      this.transactions,
      this.logger,
    );
  }

  public stepOf(status: ImprovementStatus): ScriptedStep {
    const step = this.steps.find((each) => each.status === status);
    if (step === undefined) {
      throw new Error(`The bench has no step for ${status}.`);
    }
    return step;
  }

  public async store(improvement: Improvement): Promise<void> {
    await this.improvements.insert(improvement, this.transactions.transaction);
  }

  /** Runs the job of the context once. */
  public async execute(): Promise<JobResult> {
    return this.handler().execute(this.context);
  }

  /** The improvement as the store keeps it now. */
  public async stored(): Promise<Improvement> {
    const stored = await this.improvements.findById(improvementIdOf());
    if (stored === null) {
      throw new Error('The bench stores no improvement yet.');
    }
    return stored;
  }
}
