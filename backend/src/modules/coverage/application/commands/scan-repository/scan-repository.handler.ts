import { Inject, Injectable } from '@nestjs/common';

import {
  SCAN_PAYLOAD_VERSION,
  type ScanRepositoryCommand,
} from '#coverage/application/commands/scan-repository/scan-repository.command';
import type { ScanDto } from '#coverage/application/dto/scan.dto';
import { ScanViews } from '#coverage/application/dto/scan-views';
import { findNamedRepository } from '#coverage/application/named-repository';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/contracts/repositories-public-api';

/**
 * `existing`: the key was used before for the same repository, and the
 * scan it queued is the answer as it stands now. `conflict`: the key was
 * used for another repository.
 */
export type ScanRequest =
  | { readonly outcome: 'enqueued' | 'existing'; readonly scan: ScanDto }
  | { readonly outcome: 'conflict' | 'repository_not_found' };

/**
 * Puts a scan into the queue. The job works on the repository, so its
 * subject is the repository, and one scan of a repository runs at a time.
 * The id of a scan is the id of its job.
 */
@Injectable()
export class ScanRepositoryHandler {
  private readonly repositories: RepositoriesPublicApi;
  private readonly transactions: TransactionManager;
  private readonly queue: JobQueue;
  private readonly views: ScanViews;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(ScanViews) views: ScanViews,
  ) {
    this.repositories = repositories;
    this.transactions = transactions;
    this.queue = queue;
    this.views = views;
  }

  public async execute(command: ScanRepositoryCommand): Promise<ScanRequest> {
    const repository = await findNamedRepository(
      this.repositories,
      command.repositoryId,
    );
    if (repository === null) {
      return { outcome: 'repository_not_found' };
    }
    const queued = await this.transactions.run(async (transaction) =>
      this.queue.enqueue(
        {
          kind: 'scan',
          repositoryId: repository.id,
          idempotencyKey: `scan:${command.requestKey}`,
          subjectId: repository.id.value,
          payload: { version: SCAN_PAYLOAD_VERSION },
        },
        transaction,
      ),
    );
    return queued.outcome === 'conflict'
      ? { outcome: 'conflict' }
      : { outcome: queued.outcome, scan: await this.views.get(queued.jobId) };
  }
}
