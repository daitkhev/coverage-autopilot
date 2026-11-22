import { Inject, Injectable } from '@nestjs/common';

import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Transaction } from '#kernel/transaction/transaction';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import type { ConnectRepositoryCommand } from '#repositories/application/commands/connect-repository/connect-repository.command';
import { toRepositoryDto } from '#repositories/application/dto/repository-dtos';
import { GIT, type Git } from '#repositories/application/ports/git.port';
import type { ConnectRepositoryResult } from '#repositories/contracts/repositories-public-api';
import { Repository } from '#repositories/domain/entities/repository.entity';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';
import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import {
  NOT_A_REPOSITORY_URL,
  RepositoryUrl,
} from '#repositories/domain/value-objects/repository-url.vo';

function alreadyConnected(repository: Repository): ConnectRepositoryResult {
  return {
    outcome: 'already_connected',
    repository: toRepositoryDto(repository),
  };
}

/**
 * Connects a repository by its address. The same owner and name typed a
 * second time, in any case of letters, give the repository connected the
 * first time and no second row. Its default branch is read from the host,
 * outside the transaction, which holds the look and the write alone. A
 * text that is not an address is refused before anything is asked.
 */
@Injectable()
export class ConnectRepositoryHandler {
  private readonly repositories: RepositoryRepository;
  private readonly git: Git;
  private readonly transactions: TransactionManager;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(GIT) git: Git,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
  ) {
    this.repositories = repositories;
    this.git = git;
    this.transactions = transactions;
    this.clock = clock;
    this.ids = ids;
  }

  public async execute(
    command: ConnectRepositoryCommand,
    signal: AbortSignal,
  ): Promise<ConnectRepositoryResult> {
    const url = RepositoryUrl.read(command.url);
    if (url === null) {
      return { outcome: 'invalid_url', reason: NOT_A_REPOSITORY_URL };
    }
    const known = await this.repositories.findByUrl(url);
    if (known !== null) {
      return alreadyConnected(known);
    }
    const read = await this.git.readDefaultBranch(url, signal);
    if (read.outcome === 'refused') {
      return {
        outcome: 'unreachable',
        reason: `git could not read ${url.fullName}. It said: ${read.output}`,
      };
    }
    return this.transactions.run(async (transaction) =>
      this.connectOnce(url, read.branch, transaction),
    );
  }

  /** Looks again inside the transaction: another call may have won. */
  private async connectOnce(
    url: RepositoryUrl,
    defaultBranch: BranchName,
    transaction: Transaction,
  ): Promise<ConnectRepositoryResult> {
    const known = await this.repositories.findByUrl(url, transaction);
    if (known !== null) {
      return alreadyConnected(known);
    }
    const repository = Repository.connect(
      RepositoryId.create(this.ids.generate()),
      { url, defaultBranch, connectedAt: this.clock.now() },
    );
    await this.repositories.save(repository, transaction);
    return { outcome: 'connected', repository: toRepositoryDto(repository) };
  }
}
