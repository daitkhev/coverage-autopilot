import { Inject, Injectable } from '@nestjs/common';

import { ConnectRepositoryHandler } from '#repositories/application/commands/connect-repository/connect-repository.handler';
import type {
  ConnectRepositoryRequest,
  ConnectRepositoryResult,
  RepositoryConnectionsApi,
  RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';
import { ListRepositoriesHandler } from '#repositories/application/queries/list-repositories/list-repositories.handler';

/** The connected repositories, as another module calls them. */
@Injectable()
export class RepositoryConnectionsFacade implements RepositoryConnectionsApi {
  private readonly connectHandler: ConnectRepositoryHandler;
  private readonly listHandler: ListRepositoriesHandler;

  public constructor(
    @Inject(ConnectRepositoryHandler) connectHandler: ConnectRepositoryHandler,
    @Inject(ListRepositoriesHandler) listHandler: ListRepositoriesHandler,
  ) {
    this.connectHandler = connectHandler;
    this.listHandler = listHandler;
  }

  public async connectRepository(
    request: ConnectRepositoryRequest,
    signal: AbortSignal,
  ): Promise<ConnectRepositoryResult> {
    return this.connectHandler.execute(request, signal);
  }

  public async listRepositories(): Promise<RepositoryDto[]> {
    return this.listHandler.execute();
  }
}
