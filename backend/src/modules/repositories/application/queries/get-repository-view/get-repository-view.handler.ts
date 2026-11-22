import { Inject, Injectable } from '@nestjs/common';

import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';
import { RepositoryViews } from '#repositories/application/dto/repository-views';
import { findRepository } from '#repositories/application/load-repository';
import type { GetRepositoryViewQuery } from '#repositories/application/queries/get-repository-view/get-repository-view.query';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/**
 * One repository as a person sees it, with what the coverage module knows
 * of it. `null` when no repository has the id. The other modules get a
 * repository by `GetRepositoryHandler`, which asks the coverage module
 * nothing.
 */
@Injectable()
export class GetRepositoryViewHandler {
  private readonly repositories: RepositoryRepository;
  private readonly views: RepositoryViews;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(RepositoryViews) views: RepositoryViews,
  ) {
    this.repositories = repositories;
    this.views = views;
  }

  public async execute(
    query: GetRepositoryViewQuery,
  ): Promise<RepositoryViewDto | null> {
    const repository = await findRepository(
      this.repositories,
      query.repositoryId,
    );
    return repository === null ? null : this.views.viewOf(repository);
  }
}
