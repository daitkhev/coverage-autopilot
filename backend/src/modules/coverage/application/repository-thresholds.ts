import { Inject, Injectable } from '@nestjs/common';

import { MissingRepositoryError } from '#coverage/application/errors/missing-repository.error';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
  type RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';

/** What the files of a repository are judged by, as it was read. */
export function thresholdOf(repository: RepositoryDto): CoverageThreshold {
  return CoverageThreshold.create(repository.threshold);
}

/**
 * The threshold of a repository, asked of the module of repositories each
 * time a file is judged and never kept here, so a change counts at once
 * for every snapshot, the ones taken before it too.
 */
@Injectable()
export class RepositoryThresholds {
  private readonly repositories: RepositoriesPublicApi;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
  ) {
    this.repositories = repositories;
  }

  public async of(repositoryId: RepositoryId): Promise<CoverageThreshold> {
    const repository = await this.repositories.getRepository({ repositoryId });
    if (repository === null) {
      throw new MissingRepositoryError(
        `No connected repository has the id ${repositoryId.value}, which ` +
          'a snapshot names.',
      );
    }
    return thresholdOf(repository);
  }
}
