import { Inject, Injectable } from '@nestjs/common';

import {
  SCAN_PAYLOAD_VERSION,
  type ScanRepositoryCommand,
} from '#coverage/application/commands/scan-repository/scan-repository.command';
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
 * scan it queued is the answer. `conflict`: the key was used for another
 * repository. The id of a scan is the id of its job.
 */
export type ScanRequest =
  | {
      readonly outcome: 'enqueued' | 'existing' | 'conflict';
      readonly scanId: string;
    }
  | { readonly outcome: 'repository_not_found' };

/**
 * Puts a scan into the queue. The job works on the repository, so its
 * subject is the repository, and one scan of a repository runs at a time.
 */
@Injectable()
export class ScanRepositoryHandler {
  private readonly repositories: RepositoriesPublicApi;
  private readonly transactions: TransactionManager;
  private readonly queue: JobQueue;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(JOB_QUEUE) queue: JobQueue,
  ) {
    this.repositories = repositories;
    this.transactions = transactions;
    this.queue = queue;
  }

  public async execute(command: ScanRepositoryCommand): Promise<ScanRequest> {
    const { repositoryId } = command;
    const repository = await this.repositories.getRepository({ repositoryId });
    if (repository === null) {
      return { outcome: 'repository_not_found' };
    }
    const queued = await this.transactions.run(async (transaction) =>
      this.queue.enqueue(
        {
          kind: 'scan',
          repositoryId,
          idempotencyKey: `scan:${command.requestKey}`,
          subjectId: repositoryId.value,
          payload: { version: SCAN_PAYLOAD_VERSION },
        },
        transaction,
      ),
    );
    return { outcome: queued.outcome, scanId: queued.jobId };
  }
}
