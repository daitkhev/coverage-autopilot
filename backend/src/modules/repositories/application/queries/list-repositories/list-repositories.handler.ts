import { Inject, Injectable } from '@nestjs/common';

import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';
import { RepositoryViews } from '#repositories/application/dto/repository-views';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/**
 * Every connected repository, the oldest connection first, each with what
 * the coverage module knows of it, so one request draws the list.
 */
@Injectable()
export class ListRepositoriesHandler {
  private readonly repositories: RepositoryRepository;
  private readonly views: RepositoryViews;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(RepositoryViews) views: RepositoryViews,
  ) {
    this.repositories = repositories;
    this.views = views;
  }

  public async execute(): Promise<RepositoryViewDto[]> {
    const repositories = await this.repositories.list();
    return Promise.all(
      repositories.map(async (repository) => this.views.viewOf(repository)),
    );
  }
}
