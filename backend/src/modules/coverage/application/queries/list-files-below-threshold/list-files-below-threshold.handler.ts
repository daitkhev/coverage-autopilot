import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import {
  measuredDtoOf,
  thresholdDtoOf,
} from '#coverage/application/dto/coverage-dto-mapping';
import type { ListFilesBelowThresholdQuery } from '#coverage/application/queries/list-files-below-threshold/list-files-below-threshold.query';
import type {
  CoverageThresholdDto,
  MeasuredFileDto,
} from '#coverage/contracts/coverage-public-api';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import type { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';

export interface FilesBelowThreshold {
  readonly snapshotId: string;
  readonly threshold: CoverageThresholdDto;
  /** The least covered first, then by path. */
  readonly files: readonly MeasuredFileDto[];
}

/**
 * The share of the metric of the threshold. A target always has some of
 * it to count, because a file with none is never below.
 */
function shareOf(file: FileCoverage, threshold: CoverageThreshold): number {
  const { covered, total } = file.counters.of(threshold.metric);
  return covered / total;
}

/** The measured files below a threshold: the files that can be improved. */
@Injectable()
export class ListFilesBelowThresholdHandler {
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
    query: ListFilesBelowThresholdQuery,
  ): Promise<FilesBelowThreshold | null> {
    const snapshot = await this.snapshots.findById(
      SnapshotId.create(query.snapshotId),
    );
    if (snapshot === null) {
      return null;
    }
    const threshold = query.threshold ?? this.settings.threshold;
    const files = snapshot
      .targets(threshold)
      .sort(
        (left, right) => shareOf(left, threshold) - shareOf(right, threshold),
      )
      .map((file) => measuredDtoOf(file, threshold));
    return {
      snapshotId: snapshot.id.value,
      threshold: thresholdDtoOf(threshold),
      files,
    };
  }
}
