import { Inject, Injectable } from '@nestjs/common';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';
import { RepositoryViews } from '#repositories/application/dto/repository-views';
import { findRepository } from '#repositories/application/load-repository';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/**
 * Keeps a choice a person makes for one repository and gives the
 * repository as it is seen from now on. The old choice is not kept
 * anywhere.
 */
@Injectable()
export class RepositoryChanges {
  private readonly repositories: RepositoryRepository;
  private readonly transactions: TransactionManager;
  private readonly views: RepositoryViews;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(RepositoryViews) views: RepositoryViews,
  ) {
    this.repositories = repositories;
    this.transactions = transactions;
    this.views = views;
  }

  /**
   * Read in the transaction, as a look at the head saves the repository
   * whole too, so neither undoes the other. `null` when no repository has
   * the id, and then nothing is changed.
   */
  public async change(
    repositoryId: string,
    choose: (repository: Repository) => void,
  ): Promise<RepositoryViewDto | null> {
    const repository = await this.transactions.run(async (transaction) => {
      const found = await findRepository(
        this.repositories,
        repositoryId,
        transaction,
      );
      if (found !== null) {
        choose(found);
        await this.repositories.save(found, transaction);
      }
      return found;
    });
    return repository === null ? null : this.views.viewOf(repository);
  }
}
