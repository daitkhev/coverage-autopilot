import { Inject, Injectable } from '@nestjs/common';

import type { RepositoryViewDto } from '#coverage/application/dto/repository-view.dto';
import { RepositoryViews } from '#coverage/application/dto/repository-views';
import { findNamedRepository } from '#coverage/application/named-repository';
import type { GetRepositoryQuery } from '#coverage/application/queries/get-repository/get-repository.query';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/contracts/repositories-public-api';

/**
 * One repository with what the coverage module knows of it. `null` when
 * no repository has the id.
 */
@Injectable()
export class GetRepositoryHandler {
  private readonly repositories: RepositoriesPublicApi;
  private readonly views: RepositoryViews;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(RepositoryViews) views: RepositoryViews,
  ) {
    this.repositories = repositories;
    this.views = views;
  }

  public async execute(
    query: GetRepositoryQuery,
  ): Promise<RepositoryViewDto | null> {
    const repository = await findNamedRepository(
      this.repositories,
      query.repositoryId,
    );
    return repository === null ? null : this.views.viewOf(repository);
  }
}
