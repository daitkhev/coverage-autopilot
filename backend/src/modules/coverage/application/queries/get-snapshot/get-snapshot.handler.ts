import { Inject, Injectable } from '@nestjs/common';

import type { CoverageSnapshotDto } from '#coverage/application/contracts/coverage-public-api';
import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import type { GetSnapshotQuery } from '#coverage/application/queries/get-snapshot/get-snapshot.query';
import { RepositoryThresholds } from '#coverage/application/repository-thresholds';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';

/** A snapshot, split under the threshold its repository has now. */
@Injectable()
export class GetSnapshotHandler {
  private readonly snapshots: CoverageSnapshotRepository;
  private readonly thresholds: RepositoryThresholds;

  public constructor(
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(RepositoryThresholds) thresholds: RepositoryThresholds,
  ) {
    this.snapshots = snapshots;
    this.thresholds = thresholds;
  }

  public async execute(
    query: GetSnapshotQuery,
  ): Promise<CoverageSnapshotDto | null> {
    const snapshot = await this.snapshots.findById(
      SnapshotId.create(query.snapshotId),
    );
    if (snapshot === null) {
      return null;
    }
    const threshold = await this.thresholds.of(snapshot.repositoryId);
    return snapshotDtoOf(snapshot, threshold);
  }
}
