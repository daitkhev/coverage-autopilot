import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { fileDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import type { GetFileCoverageQuery } from '#coverage/application/queries/get-file-coverage/get-file-coverage.query';
import type { FileCoverageDto } from '#coverage/contracts/coverage-public-api';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';

/**
 * One file of a snapshot. An improvement checks with it that its target
 * is measured: a file with no numbers or no code is never a target.
 */
@Injectable()
export class GetFileCoverageHandler {
  private readonly snapshots: CoverageSnapshotRepository;
  private readonly settings: CoverageSettings;

  public constructor(
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(COVERAGE_SETTINGS) settings: CoverageSettings,
  ) {
    this.snapshots = snapshots;
    this.settings = settings;
  }

  public async execute(
    query: GetFileCoverageQuery,
  ): Promise<FileCoverageDto | null> {
    const snapshot = await this.snapshots.findById(
      SnapshotId.create(query.snapshotId),
    );
    const file = snapshot?.fileAt(query.path) ?? null;
    return file === null ? null : fileDtoOf(file, this.settings.threshold);
  }
}
