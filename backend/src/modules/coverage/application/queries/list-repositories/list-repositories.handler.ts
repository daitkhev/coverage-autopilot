import { Inject, Injectable } from '@nestjs/common';

import type { RepositoryViewDto } from '#coverage/application/dto/repository-view.dto';
import { RepositoryViews } from '#coverage/application/dto/repository-views';
import {
  REPOSITORY_CONNECTIONS_API,
  type RepositoryConnectionsApi,
} from '#repositories/application/contracts/repositories-public-api';

/**
 * Every connected repository, the oldest connection first, each with
 * what the coverage module knows of it, so one request draws the list.
 */
@Injectable()
export class ListRepositoriesHandler {
  private readonly connections: RepositoryConnectionsApi;
  private readonly views: RepositoryViews;

  public constructor(
    @Inject(REPOSITORY_CONNECTIONS_API) connections: RepositoryConnectionsApi,
    @Inject(RepositoryViews) views: RepositoryViews,
  ) {
    this.connections = connections;
    this.views = views;
  }

  public async execute(): Promise<RepositoryViewDto[]> {
    const repositories = await this.connections.listRepositories();
    return Promise.all(
      repositories.map(async (repository) => this.views.viewOf(repository)),
    );
  }
}
