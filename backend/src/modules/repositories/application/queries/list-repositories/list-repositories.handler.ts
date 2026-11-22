import { Inject, Injectable } from '@nestjs/common';

import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';
import { toRepositoryDto } from '#repositories/application/dto/repository-dtos';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/** Every connected repository, the oldest connection first. */
@Injectable()
export class ListRepositoriesHandler {
  private readonly repositories: RepositoryRepository;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
  ) {
    this.repositories = repositories;
  }

  public async execute(): Promise<RepositoryDto[]> {
    const repositories = await this.repositories.list();
    return repositories.map(toRepositoryDto);
  }
}
