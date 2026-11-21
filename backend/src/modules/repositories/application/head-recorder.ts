import { Inject, Injectable } from '@nestjs/common';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
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

  public async record(
    repository: Repository,
    head: RepositoryHead,
  ): Promise<void> {
    repository.recordHead(head);
    await this.transactions.run(async (transaction) =>
      this.repositories.save(repository, transaction),
    );
  }
}
