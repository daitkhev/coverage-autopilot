import { Inject, Injectable } from '@nestjs/common';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import { loadRepository } from '#repositories/application/load-repository';
import type {
  Repository,
  RepositoryHead,
} from '#repositories/domain/entities/repository.entity';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/**
 * Keeps what a look at the default branch found. Every operation that
 * reads the head keeps it, so `outdated` is true to the last look.
 */
@Injectable()
export class HeadRecorder {
  private readonly repositories: RepositoryRepository;
  private readonly transactions: TransactionManager;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
  ) {
    this.repositories = repositories;
    this.transactions = transactions;
  }

  /**
   * The repository is read again in the transaction, since the host may
   * have taken seconds to answer: a threshold set meanwhile is kept.
   */
  public async record(
    repository: Repository,
    head: RepositoryHead,
  ): Promise<void> {
    await this.transactions.run(async (transaction) => {
      const kept = await loadRepository(
        this.repositories,
        repository.id,
        transaction,
      );
      kept.recordHead(head);
      await this.repositories.save(kept, transaction);
    });
  }
}
