import { Inject, Injectable } from '@nestjs/common';

import type { CoverageSnapshotDto } from '#coverage/application/contracts/coverage-public-api';
import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import { findNamedRepository } from '#coverage/application/named-repository';
import type { ListSnapshotsQuery } from '#coverage/application/queries/list-snapshots/list-snapshots.query';
import { thresholdOf } from '#coverage/application/repository-thresholds';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/application/contracts/repositories-public-api';

/**
 * The snapshots of a repository, the newest first, each split under the
 * threshold the repository has now. `null` when no repository has the id:
 * an empty list belongs to a repository that was never scanned.
 */
@Injectable()
export class ListSnapshotsHandler {
  private readonly repositories: RepositoriesPublicApi;
  private readonly snapshots: CoverageSnapshotRepository;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
  ) {
    this.repositories = repositories;
    this.snapshots = snapshots;
  }

  public async execute(
    query: ListSnapshotsQuery,
  ): Promise<CoverageSnapshotDto[] | null> {
    const repository = await findNamedRepository(
      this.repositories,
      query.repositoryId,
    );
    if (repository === null) {
      return null;
    }
    const threshold = thresholdOf(repository);
    const snapshots = await this.snapshots.listByRepository(repository.id);
    return snapshots.map((snapshot) => snapshotDtoOf(snapshot, threshold));
  }
}
