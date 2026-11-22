import { Inject, Injectable } from '@nestjs/common';

import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';
import {
  DEFAULT_THRESHOLD,
  type DefaultThreshold,
} from '#repositories/application/default-threshold';
import { toRepositoryDto } from '#repositories/application/dto/repository-dtos';
import type { GetRepositoryQuery } from '#repositories/application/queries/get-repository/get-repository.query';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/**
 * One connected repository, with the threshold its files are judged by
 * now, or `null` when none has the id.
 */
@Injectable()
export class GetRepositoryHandler {
  private readonly repositories: RepositoryRepository;
  private readonly threshold: DefaultThreshold;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(DEFAULT_THRESHOLD) threshold: DefaultThreshold,
  ) {
    this.repositories = repositories;
    this.threshold = threshold;
  }

  public async execute(
    query: GetRepositoryQuery,
  ): Promise<RepositoryDto | null> {
    const repository = await this.repositories.findById(query.repositoryId);
    return repository === null
      ? null
      : toRepositoryDto(repository, this.threshold);
  }
}
