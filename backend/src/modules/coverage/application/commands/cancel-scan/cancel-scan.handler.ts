import { Inject, Injectable } from '@nestjs/common';

import type { CancelScanCommand } from '#coverage/application/commands/cancel-scan/cancel-scan.command';
import type { ScanDto } from '#coverage/application/dto/scan.dto';
import { ScanViews } from '#coverage/application/dto/scan-views';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';

/**
 * Cancels a scan that has not ended, through its job. A worker that runs
 * it learns of the cancel at its next heartbeat or save and writes
 * nothing after it, so the scan stays cancelled. The queue leaves a job
 * that ended as it is, also one that ended since it was read, so a scan
 * that ended is answered as it is and cancelling twice is no error.
 * `null` when no scan has the id.
 */
@Injectable()
export class CancelScanHandler {
  private readonly transactions: TransactionManager;
  private readonly queue: JobQueue;
  private readonly views: ScanViews;

  public constructor(
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(ScanViews) views: ScanViews,
  ) {
    this.transactions = transactions;
    this.queue = queue;
    this.views = views;
  }

  public async execute(command: CancelScanCommand): Promise<ScanDto | null> {
    const job = await this.views.findJob(command.scanId);
    if (job === null) {
      return null;
    }
    if (job.endedAt === null) {
      await this.transactions.run(async (transaction) =>
        this.queue.cancel(job.id, transaction),
      );
    }
    return this.views.find(job.id);
  }
}
