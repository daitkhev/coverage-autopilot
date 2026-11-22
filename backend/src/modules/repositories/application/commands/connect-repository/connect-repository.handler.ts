import { Inject, Injectable } from '@nestjs/common';

import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Transaction } from '#kernel/transaction/transaction';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import type {
  ConnectRepositoryCommand,
  ConnectRepositoryResult,
} from '#repositories/application/commands/connect-repository/connect-repository.command';
import { RepositoryViews } from '#repositories/application/dto/repository-views';
import { GIT, type Git } from '#repositories/application/ports/git.port';
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

/** A repository connected or found, before a person sees it. */
type Connection =
  | {
      readonly outcome: 'connected' | 'already_connected';
      readonly repository: Repository;
    }
  | {
      readonly outcome: 'invalid_url' | 'unreachable';
      readonly reason: string;
    };

function alreadyConnected(repository: Repository): Connection {
  return { outcome: 'already_connected', repository };
}

/**
 * Connects a repository by its address and answers it as a person sees
 * it. The same owner and name typed a second time, in any case of
 * letters, give the repository connected the first time and no second
 * row. Its default branch is read from the host, outside the transaction,
 * which holds the look and the write alone. A text that is not an address
 * is refused before anything is asked.
 */
@Injectable()
export class ConnectRepositoryHandler {
  private readonly repositories: RepositoryRepository;
  private readonly git: Git;
  private readonly transactions: TransactionManager;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly views: RepositoryViews;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(GIT) git: Git,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
    @Inject(RepositoryViews) views: RepositoryViews,
  ) {
    this.repositories = repositories;
    this.git = git;
    this.transactions = transactions;
    this.clock = clock;
    this.ids = ids;
    this.views = views;
  }

  public async execute(
    command: ConnectRepositoryCommand,
    signal: AbortSignal,
  ): Promise<ConnectRepositoryResult> {
    const connection = await this.connect(command.url, signal);
    if ('reason' in connection) {
      return connection;
    }
    return {
      outcome: connection.outcome,
      repository: await this.views.viewOf(connection.repository),
    };
  }

  private async connect(
    text: string,
    signal: AbortSignal,
  ): Promise<Connection> {
    const url = RepositoryUrl.read(text);
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
  ): Promise<Connection> {
    const known = await this.repositories.findByUrl(url, transaction);
    if (known !== null) {
      return alreadyConnected(known);
    }
    const repository = Repository.connect(
      RepositoryId.create(this.ids.generate()),
      { url, defaultBranch, connectedAt: this.clock.now() },
    );
    await this.repositories.save(repository, transaction);
    return { outcome: 'connected', repository };
  }
}
