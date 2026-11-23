import { Inject, Injectable } from '@nestjs/common';

import type { FileCoverageDto } from '#coverage/application/contracts/coverage-public-api';
import { fileDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import type { GetFileCoverageQuery } from '#coverage/application/queries/get-file-coverage/get-file-coverage.query';
import { RepositoryThresholds } from '#coverage/application/repository-thresholds';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';

/**
 * One file of a snapshot, judged by the threshold its repository has now.
 * An improvement checks with it that its target is measured, since a file
 * with no numbers or no code is never a target, and that it is below.
 */
@Injectable()
export class GetFileCoverageHandler {
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
    query: GetFileCoverageQuery,
  ): Promise<FileCoverageDto | null> {
    const snapshot = await this.snapshots.findById(
      SnapshotId.create(query.snapshotId),
    );
    if (snapshot === null) {
      return null;
    }
    const file = snapshot.fileAt(query.path);
    return file === null
      ? null
      : fileDtoOf(file, await this.thresholds.of(snapshot.repositoryId));
  }
}
