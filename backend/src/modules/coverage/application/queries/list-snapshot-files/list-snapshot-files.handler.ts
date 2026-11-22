import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import {
  fileDtoOf,
  thresholdDtoOf,
} from '#coverage/application/dto/coverage-dto-mapping';
import type { ListSnapshotFilesQuery } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.query';
import type {
  FileCoverageDto,
  SnapshotFilesDto,
} from '#coverage/contracts/coverage-public-api';
import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { CoverageMetric } from '#coverage/domain/value-objects/coverage-counters.vo';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import type { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';

type SnapshotFile = FileCoverage | UnmeasuredFile;

type Order = (left: SnapshotFile, right: SnapshotFile) => number;

/**
 * The covered share of the metric, or `null` for a file that has none of
 * it to count: a file with no numbers has no share, and that is not 0.
 */
function shareOf(file: SnapshotFile, metric: CoverageMetric): number | null {
  if (!(file instanceof FileCoverage)) {
    return null;
  }
  const { covered, total } = file.counters.of(metric);
  return total === 0 ? null : covered / total;
}

/** By code unit, so the order is the same under every locale. */
function byPath(left: SnapshotFile, right: SnapshotFile): number {
  const [first, second] = [left.path.value, right.path.value];
  return Number(first > second) - Number(first < second);
}

function leastCoveredFirst(metric: CoverageMetric): Order {
  return (left, right) => {
    const [first, second] = [shareOf(left, metric), shareOf(right, metric)];
    const byShare =
      first === null || second === null
        ? Number(first === null) - Number(second === null)
        : first - second;
    return byShare === 0 ? byPath(left, right) : byShare;
  };
}

function isAsked(
  file: FileCoverageDto,
  query: ListSnapshotFilesQuery,
): boolean {
  const inState = query.state === undefined || file.state === query.state;
  const below =
    query.below === undefined ||
    (file.state === 'measured' && file.belowThreshold);
  return inState && below;
}

function filesOf(
  snapshot: CoverageSnapshot,
  threshold: CoverageThreshold,
  query: ListSnapshotFilesQuery,
): FileCoverageDto[] {
  return [...snapshot.files, ...snapshot.unmeasured]
    .sort(leastCoveredFirst(threshold.metric))
    .map((file) => fileDtoOf(file, threshold))
    .filter((file) => isAsked(file, query));
}

/**
 * The files of a snapshot in all three states, narrowed by the filters of
 * the query. `below` and `metric` make the threshold each file is judged
 * by, and what the settings say fills what they leave out. `null` when no
 * snapshot has the id.
 */
@Injectable()
export class ListSnapshotFilesHandler {
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
    query: ListSnapshotFilesQuery,
  ): Promise<SnapshotFilesDto | null> {
    const snapshot = await this.snapshots.findById(
      SnapshotId.create(query.snapshotId),
    );
    if (snapshot === null) {
      return null;
    }
    const threshold = this.thresholdOf(query);
    return {
      snapshotId: snapshot.id.value,
      threshold: thresholdDtoOf(threshold),
      files: filesOf(snapshot, threshold, query),
    };
  }

  private thresholdOf(query: ListSnapshotFilesQuery): CoverageThreshold {
    const { metric, percentage } = this.settings.threshold;
    return CoverageThreshold.create({
      metric: query.metric ?? metric,
      percentage: query.below ?? percentage.value,
    });
  }
}
