import { Inject, Injectable } from '@nestjs/common';

import type { ApproveImprovementCommand } from '#improvement/application/commands/approve-improvement/approve-improvement.command';
import { publishJobOf } from '#improvement/application/commands/run-improvement/improvement-jobs';
import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';
import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Transaction } from '#kernel/transaction/transaction';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';

/**
 * Approves the accepted patch of an improvement in review mode, and adds
 * the job that publishes it: the job before it ended when it asked, so
 * waiting for a person held no repository. `null` when no improvement has
 * the id. Another hash and an improvement that does not wait for an
 * approval are refused by the improvement itself.
 */
@Injectable()
export class ApproveImprovementHandler {
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
    command: ApproveImprovementCommand,
  ): Promise<ImprovementDto | null> {
    const id = ImprovementId.create(command.improvementId);
    const approved = await this.transactions.run(async (transaction) =>
      this.approveOnce(id, command.patchHash, transaction),
    );
    return approved === null ? null : this.views.of(approved);
  }

  /** Reads inside the transaction, so a cancel cannot come in between. */
  private async approveOnce(
    id: ImprovementId,
    patchHash: string,
    transaction: Transaction,
  ): Promise<Improvement | null> {
    const improvement = await this.improvements.findById(id, transaction);
    if (improvement === null) {
      return null;
    }
    improvement.approve(patchHash, this.clock.now());
    const saved = await this.improvements.save(improvement, transaction);
    await this.queue.enqueue(publishJobOf(saved), transaction);
    return saved;
  }
}
