import { Inject, Injectable } from '@nestjs/common';

import type { CoverageSnapshotDto } from '#coverage/application/contracts/coverage-public-api';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import { findNamedRepository } from '#coverage/application/named-repository';
import type { ListSnapshotsQuery } from '#coverage/application/queries/list-snapshots/list-snapshots.query';
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
 * threshold of the settings. `null` when no repository has the id: an
 * empty list belongs to a repository that was never scanned.
 */
@Injectable()
export class ListSnapshotsHandler {
  private readonly repositories: RepositoriesPublicApi;
  private readonly snapshots: CoverageSnapshotRepository;
  private readonly settings: CoverageSettings;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(COVERAGE_SETTINGS) settings: CoverageSettings,
  ) {
    this.repositories = repositories;
    this.snapshots = snapshots;
    this.settings = settings;
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
    const snapshots = await this.snapshots.listByRepository(repository.id);
    return snapshots.map((snapshot) =>
      snapshotDtoOf(snapshot, this.settings.threshold),
    );
  }
}
