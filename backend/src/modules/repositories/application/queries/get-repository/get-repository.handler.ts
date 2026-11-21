import { Inject, Injectable } from '@nestjs/common';

import { toRepositoryDto } from '#repositories/application/dto/repository-dtos';
import type { GetRepositoryQuery } from '#repositories/application/queries/get-repository/get-repository.query';
import type { RepositoryDto } from '#repositories/contracts/repositories-public-api';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/** One connected repository, or `null` when none has the id. */
@Injectable()
export class GetRepositoryHandler {
  private readonly repositories: RepositoryRepository;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
  ) {
    this.repositories = repositories;
  }

  public async execute(
    query: GetRepositoryQuery,
  ): Promise<RepositoryDto | null> {
    const repository = await this.repositories.findById(query.repositoryId);
    return repository === null ? null : toRepositoryDto(repository);
  }
}
