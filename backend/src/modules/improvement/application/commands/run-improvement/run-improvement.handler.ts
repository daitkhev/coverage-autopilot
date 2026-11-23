import { Inject, Injectable } from '@nestjs/common';

import { answerTo } from '#improvement/application/commands/run-improvement/fault-answer';
import { IMPROVEMENT_JOB_VERSION } from '#improvement/application/commands/run-improvement/improvement-jobs';
import { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import {
  IMPROVEMENT_STEPS,
  type ImprovementStep,
  type StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import { RunDeadline } from '#improvement/application/commands/run-improvement/run-deadline';
import {
  budgetExhausted,
  type Change,
  retriesExhausted,
  unreadablePayload,
} from '#improvement/application/commands/run-improvement/run-failures';
import {
  stepEndOf,
  stepFieldsOf,
} from '#improvement/application/commands/run-improvement/step-lines';
import { MissingStepError } from '#improvement/application/errors/missing-step.error';
import { StalledStepError } from '#improvement/application/errors/stalled-step.error';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import {
  ImprovementId,
  LOWER_CASE_UUID,
} from '#improvement/domain/value-objects/improvement-id.vo';
import {
  type ImprovementStatus,
  isFinal,
} from '#improvement/domain/value-objects/improvement-status.vo';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';
import { ALARM, type Alarm } from '#ports/alarm.port';
import type {
  DeadJobContext,
  JobContext,
  JobHandler,
  JobResult,
} from '#ports/job-handler.port';
import { LOGGER, type Logger } from '#ports/logger.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';

/** The version of the outcome of an improvement job this service writes. */
const OUTCOME_VERSION = 1;

/** What the run does next, for the status the improvement is in. */
type Move =
  | { readonly next: 'finish' }
  | { readonly next: 'change'; readonly change: Change }
  | { readonly next: 'step'; readonly step: ImprovementStep };

type Work = Exclude<Move, { readonly next: 'finish' }>;

/** One run of the job, as each move of it needs it. */
interface Execution {
  readonly run: ImprovementRun;
  readonly context: JobContext;
  readonly deadline: RunDeadline;
}

const FINISH: Move = { next: 'finish' };

const START: Move = {
  next: 'change',
  change: (improvement, at) => {
    improvement.startWork(at);
  },
};

const RESUME: Move = {
  next: 'change',
  change: (improvement, at) => {
    improvement.resume(at);
  },
};

const CONTINUE: StepResult = { next: 'continue' };

function finished(outcome: ImprovementStatus | 'not_found'): JobResult {
  return { status: 'finished', outcome: { version: OUTCOME_VERSION, outcome } };
}

/** A wait for the window of the generator ends when its moment comes. */
function isDue(improvement: Improvement, now: Instant): boolean {
  const { resumesAt } = improvement;
  return resumesAt === null || !now.isBefore(resumesAt);
}

/** A move that goes on must have saved something, or it runs for ever. */
function requireChange(before: Improvement, after: Improvement): void {
  if (before.status === after.status && before.version === after.version) {
    throw new StalledStepError(
      `The step of ${after.status} went on and saved nothing, so it would ` +
        'run for ever.',
    );
  }
}

/**
 * Runs the job of an improvement: from the status it finds, step after
 * step, up to a wait or an end. Each step saves what it did through the
 * lease, so a run after a crash goes on from the last save. The run has
 * one signal, which also stops it when the deadline of the improvement
 * comes.
 */
@Injectable()
export class RunImprovementHandler implements JobHandler {
  public readonly kind = 'improvement';
  private readonly improvements: ImprovementRepository;
  private readonly steps: ReadonlyMap<ImprovementStatus, ImprovementStep>;
  private readonly clock: Clock;
  private readonly alarm: Alarm;
  private readonly transactions: TransactionManager;
  private readonly logger: Logger;

  public constructor(
    @Inject(IMPROVEMENT_REPOSITORY) improvements: ImprovementRepository,
    @Inject(IMPROVEMENT_STEPS) steps: readonly ImprovementStep[],
    @Inject(CLOCK) clock: Clock,
    @Inject(ALARM) alarm: Alarm,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(LOGGER) logger: Logger,
  ) {
    this.improvements = improvements;
    this.steps = new Map(steps.map((step) => [step.status, step]));
    this.clock = clock;
    this.alarm = alarm;
    this.transactions = transactions;
    this.logger = logger.child({ component: 'improvement-run' });
  }

  public async execute(context: JobContext): Promise<JobResult> {
    const improvement = await this.find(context.subjectId);
    if (improvement === null) {
      return finished('not_found');
    }
    const { alarm, clock } = this;
    const deadline = new RunDeadline(context.signal, { alarm, clock });
    try {
      const run = this.runOf(improvement, context, deadline.signal);
      return context.payload.version === IMPROVEMENT_JOB_VERSION
        ? await this.advance({ run, context, deadline })
        : await this.refuse(run, context.payload.version);
    } finally {
      deadline.release();
    }
  }

  /**
   * The job will not run again, so an improvement that is not over fails.
   * There is no lease to save through, so it is saved in a transaction of
   * its own.
   */
  public async onRetriesExhausted(context: DeadJobContext): Promise<void> {
    await this.transactions.run(async (transaction) => {
      const improvement = await this.find(context.subjectId, transaction);
      if (improvement === null || isFinal(improvement.status)) {
        return;
      }
      const giveUp = retriesExhausted();
      giveUp(improvement, this.clock.now());
      await this.improvements.save(improvement, transaction);
    });
  }

  private runOf(
    improvement: Improvement,
    context: JobContext,
    signal: AbortSignal,
  ): ImprovementRun {
    const { improvements, clock } = this;
    return new ImprovementRun(improvement, {
      context,
      signal,
      improvements,
      clock,
    });
  }

  /** A subject that is not the id of an improvement names none. */
  private async find(
    subjectId: string,
    transaction?: Transaction,
  ): Promise<Improvement | null> {
    return LOWER_CASE_UUID.test(subjectId)
      ? this.improvements.findById(ImprovementId.create(subjectId), transaction)
      : null;
  }

  /** A job another version of the service wrote cannot be run here. */
  private async refuse(
    run: ImprovementRun,
    version: number,
  ): Promise<JobResult> {
    if (!isFinal(run.improvement.status)) {
      await run.save(unreadablePayload(version));
    }
    return finished(run.improvement.status);
  }

  private async advance(execution: Execution): Promise<JobResult> {
    const { run } = execution;
    for (;;) {
      const move = this.moveOf(run.improvement, run.now());
      if (move.next === 'finish') {
        return finished(run.improvement.status);
      }
      const before = run.improvement;
      const result = await this.perform(move, execution);
      if (result.next === 'retry') {
        return { status: 'retry', reason: result.reason };
      }
      requireChange(before, run.improvement);
    }
  }

  /**
   * An approval adds the job that publishes, and a job that waits for the
   * window of the generator is in the queue already.
   */
  private moveOf(improvement: Improvement, now: Instant): Move {
    const { status } = improvement;
    if (isFinal(status)) {
      return FINISH;
    }
    switch (status) {
      case 'created':
        return START;
      case 'awaiting_approval':
        return FINISH;
      case 'waiting_for_limit':
        return isDue(improvement, now) ? RESUME : FINISH;
      default:
        return { next: 'step', step: this.stepOf(status) };
    }
  }

  private stepOf(status: ImprovementStatus): ImprovementStep {
    const step = this.steps.get(status);
    if (step === undefined) {
      throw new MissingStepError(
        `No step does the work of an improvement that is ${status}.`,
      );
    }
    return step;
  }

  /**
   * A step says when it starts and how it ends, with the ids of its
   * journey. A move of the handler itself, such as a start, is no step.
   */
  private async perform(work: Work, execution: Execution): Promise<StepResult> {
    if (work.next === 'change') {
      return this.attempt(work, execution);
    }
    const { run, context } = execution;
    const log = this.logger.child(stepFieldsOf(run.improvement, context));
    log.info('A step of an improvement started.');
    try {
      const result = await this.attempt(work, execution);
      log.info(
        'A step of an improvement ended.',
        stepEndOf(result, run.improvement),
      );
      return result;
    } catch (error) {
      // A stop, a lost lease or a fault nobody foresaw: the lines of the
      // job say which.
      log.info('A step of an improvement ended.', { outcome: 'interrupted' });
      throw error;
    }
  }

  private async attempt(work: Work, execution: Execution): Promise<StepResult> {
    try {
      return await this.carryOut(work, execution);
    } catch (error) {
      return this.answerFault(error, work, execution);
    }
  }

  /** A step runs only while time is left, with the alarm at the deadline. */
  private async carryOut(
    work: Work,
    execution: Execution,
  ): Promise<StepResult> {
    const { run, deadline } = execution;
    if (work.next === 'change') {
      await run.save(work.change);
      return CONTINUE;
    }
    deadline.watch(run.improvement.deadlineAt);
    if (deadline.hasPassed()) {
      await run.save(budgetExhausted(run.improvement));
      return CONTINUE;
    }
    return work.step.run(run);
  }

  /** The failure an answer asks for is saved once and not answered again. */
  private async answerFault(
    error: unknown,
    work: Work,
    execution: Execution,
  ): Promise<StepResult> {
    const { run, context, deadline } = execution;
    const answer = answerTo(error, {
      jobSignal: context.signal,
      deadline,
      improvement: run.improvement,
      step: work.next === 'step' ? work.step : null,
    });
    if (answer.next === 'retry') {
      return answer;
    }
    await run.save(answer.change);
    return CONTINUE;
  }
}
