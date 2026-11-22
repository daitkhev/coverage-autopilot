import { Inject, Injectable } from '@nestjs/common';

import type { Transaction } from '#kernel/transaction/transaction';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import type { ChangeThresholdCommand } from '#repositories/application/commands/change-threshold/change-threshold.command';
import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';
import { RepositoryViews } from '#repositories/application/dto/repository-views';
import { findRepository } from '#repositories/application/load-repository';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';

/** No percent of its own is the default of the service. */
function thresholdOf(percentage: number | null): ThresholdPercentage | null {
  return percentage === null ? null : ThresholdPercentage.create(percentage);
}

/**
 * Gives a repository a threshold of its own, or the default of the
 * service back. The old one is not kept anywhere, so every snapshot of
 * the repository is judged by the new one from the next read. `null` when
 * no repository has the id.
 */
@Injectable()
export class ChangeThresholdHandler {
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

  public async execute(
    command: ChangeThresholdCommand,
  ): Promise<RepositoryViewDto | null> {
    const repository = await this.transactions.run(async (transaction) =>
      this.changed(command, transaction),
    );
    return repository === null ? null : this.views.viewOf(repository);
  }

  /**
   * Read in the transaction, as a look at the head saves the repository
   * whole too, so neither undoes the other.
   */
  private async changed(
    command: ChangeThresholdCommand,
    transaction: Transaction,
  ): Promise<Repository | null> {
    const repository = await findRepository(
      this.repositories,
      command.repositoryId,
      transaction,
    );
    if (repository === null) {
      return null;
    }
    repository.changeThreshold(thresholdOf(command.percentage));
    await this.repositories.save(repository, transaction);
    return repository;
  }
}
