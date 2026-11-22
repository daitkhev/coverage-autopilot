import { Inject, Injectable } from '@nestjs/common';

import type { CoverageSnapshotDto } from '#coverage/application/contracts/coverage-public-api';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import type { GetSnapshotQuery } from '#coverage/application/queries/get-snapshot/get-snapshot.query';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';

/** A snapshot, split under the threshold of the settings. */
@Injectable()
export class GetSnapshotHandler {
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
    query: GetSnapshotQuery,
  ): Promise<CoverageSnapshotDto | null> {
    const snapshot = await this.snapshots.findById(
      SnapshotId.create(query.snapshotId),
    );
    return snapshot === null
      ? null
      : snapshotDtoOf(snapshot, this.settings.threshold);
  }
}
