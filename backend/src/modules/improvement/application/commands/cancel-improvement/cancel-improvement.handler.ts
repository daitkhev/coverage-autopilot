import { Inject, Injectable } from '@nestjs/common';

import type { CancelImprovementCommand } from '#improvement/application/commands/cancel-improvement/cancel-improvement.command';
import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';
import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import { isFinal } from '#improvement/domain/value-objects/improvement-status.vo';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Transaction } from '#kernel/transaction/transaction';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';

/**
 * Cancels an improvement and every job of it that has not ended, the one
 * a wait left behind too. A worker that runs it now learns of the cancel
 * through its lease, and its next save is refused. An improvement that
 * ended already is answered as it is. `null` when none has the id.
 */
@Injectable()
export class CancelImprovementHandler {
  private readonly improvements: ImprovementRepository;
  private readonly transactions: TransactionManager;
  private readonly queue: JobQueue;
  private readonly clock: Clock;
  private readonly views: ImprovementViews;

  public constructor(
    @Inject(IMPROVEMENT_REPOSITORY) improvements: ImprovementRepository,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(CLOCK) clock: Clock,
    @Inject(ImprovementViews) views: ImprovementViews,
  ) {
    this.improvements = improvements;
    this.transactions = transactions;
    this.queue = queue;
    this.clock = clock;
    this.views = views;
  }

  public async execute(
    command: CancelImprovementCommand,
  ): Promise<ImprovementDto | null> {
    const id = ImprovementId.create(command.improvementId);
    const cancelled = await this.transactions.run(async (transaction) =>
      this.cancelOnce(id, transaction),
    );
    return cancelled === null ? null : this.views.of(cancelled);
  }

  /** Reads inside the transaction, so the worker cannot save in between. */
  private async cancelOnce(
    id: ImprovementId,
    transaction: Transaction,
  ): Promise<Improvement | null> {
    const improvement = await this.improvements.findById(id, transaction);
    if (improvement === null || isFinal(improvement.status)) {
      return improvement;
    }
    improvement.cancel(this.clock.now());
    const saved = await this.improvements.save(improvement, transaction);
    await this.queue.cancelSubject(id.value, transaction);
    return saved;
  }
}
