import { Inject, Injectable } from '@nestjs/common';

import type {
  ConnectRepositoryCommand,
  ConnectRepositoryResult,
} from '#coverage/application/commands/connect-repository/connect-repository.command';
import { RepositoryViews } from '#coverage/application/dto/repository-views';
import {
  REPOSITORY_CONNECTIONS_API,
  type RepositoryConnectionsApi,
} from '#repositories/application/contracts/repositories-public-api';

/**
 * Connects a repository through its module, and answers it with what the
 * coverage module knows of it. A repository connected before may have
 * snapshots and a scan already.
 */
@Injectable()
export class ConnectRepositoryHandler {
  private readonly connections: RepositoryConnectionsApi;
  private readonly views: RepositoryViews;

  public constructor(
    @Inject(REPOSITORY_CONNECTIONS_API) connections: RepositoryConnectionsApi,
    @Inject(RepositoryViews) views: RepositoryViews,
  ) {
    this.connections = connections;
    this.views = views;
  }

  public async execute(
    command: ConnectRepositoryCommand,
    signal: AbortSignal,
  ): Promise<ConnectRepositoryResult> {
    const result = await this.connections.connectRepository(
      { url: command.url },
      signal,
    );
    if ('reason' in result) {
      return result;
    }
    return {
      outcome: result.outcome,
      repository: await this.views.viewOf(result.repository),
    };
  }
}
