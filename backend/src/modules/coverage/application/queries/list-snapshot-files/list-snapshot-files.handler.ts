import { Inject, Injectable } from '@nestjs/common';

import type { FileCoverageDto } from '#coverage/application/contracts/coverage-public-api';
import {
  FILE_IMPROVEMENTS,
  type FileImprovementDto,
  type FileImprovements,
} from '#coverage/application/contracts/file-improvements';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import {
  fileDtoOf,
  thresholdDtoOf,
} from '#coverage/application/dto/coverage-dto-mapping';
import type {
  SnapshotFileDto,
  SnapshotFilesDto,
} from '#coverage/application/dto/snapshot-files.dto';
import type { ListSnapshotFilesQuery } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.query';
import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import { InvalidSnapshotIdError } from '#coverage/domain/errors/invalid-snapshot-id.error';
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
 * Each measured file with the newest improvement of its path. They are
 * joined by path, so the files keep their order.
 */
function withWork(
  files: readonly FileCoverageDto[],
  latest: readonly FileImprovementDto[],
): SnapshotFileDto[] {
  const work = new Map(latest.map((each) => [each.path.value, each.latest]));
  return files.map((file) =>
    file.state === 'measured'
      ? { ...file, latestImprovement: work.get(file.path.value) ?? null }
      : file,
  );
}

/**
 * A route takes any text as an id, and the domain refuses one that is no
 * id of a snapshot by throwing. That text names no snapshot, which is an
 * answer and not a fault.
 */
function snapshotIdOf(text: string): SnapshotId | null {
  try {
    return SnapshotId.create(text);
  } catch (error) {
    if (error instanceof InvalidSnapshotIdError) {
      return null;
    }
    throw error;
  }
}

/**
 * The files of a snapshot in all three states, narrowed by the filters of
 * the query, each measured one with the work on it. `below` and `metric`
 * make the threshold each file is judged by, and what the settings say
 * fills what they leave out. The improvements are known to the module
 * above this one only, so they come through the port `FILE_IMPROVEMENTS`,
 * read once for the whole list. `null` when no snapshot has the id, also
 * when the id is no id of a snapshot at all.
 */
@Injectable()
export class ListSnapshotFilesHandler {
  private readonly snapshots: CoverageSnapshotRepository;
  private readonly settings: CoverageSettings;
  private readonly improvements: FileImprovements;

  public constructor(
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(COVERAGE_SETTINGS) settings: CoverageSettings,
    @Inject(FILE_IMPROVEMENTS) improvements: FileImprovements,
  ) {
    this.snapshots = snapshots;
    this.settings = settings;
    this.improvements = improvements;
  }

  public async execute(
    query: ListSnapshotFilesQuery,
  ): Promise<SnapshotFilesDto | null> {
    const id = snapshotIdOf(query.snapshotId);
    const snapshot = id === null ? null : await this.snapshots.findById(id);
    if (snapshot === null) {
      return null;
    }
    const threshold = this.thresholdOf(query);
    const latest = await this.improvements.latestOf(snapshot.repositoryId);
    return {
      snapshotId: snapshot.id.value,
      threshold: thresholdDtoOf(threshold),
      items: withWork(filesOf(snapshot, threshold, query), latest),
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
