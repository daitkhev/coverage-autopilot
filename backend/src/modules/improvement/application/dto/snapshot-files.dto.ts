import type {
  CoverageCountersDto,
  CoverageThresholdDto,
  FileCoverageDto,
  MeasuredFileDto,
} from '#coverage/contracts/coverage-public-api';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';

/** The newest improvement of a file: which one, and how far it came. */
export interface ImprovementRefDto {
  readonly id: string;
  readonly status: ImprovementStatus;
}

/**
 * A measured file with its counters under the name a person reads them
 * by, and the newest improvement of its path, or `null` for none.
 */
export interface MeasuredFileWorkDto extends Omit<MeasuredFileDto, 'counters'> {
  readonly coverage: CoverageCountersDto;
  readonly latestImprovement: ImprovementRefDto | null;
}

/** Only a measured file can be a target, so only it has work on it. */
export type SnapshotFileDto =
  MeasuredFileWorkDto | Exclude<FileCoverageDto, MeasuredFileDto>;

/** The files of a snapshot as a query narrowed them, with the work on each. */
export interface SnapshotFilesDto {
  readonly snapshotId: string;
  /** What `belowThreshold` of each measured file was judged by. */
  readonly threshold: CoverageThresholdDto;
  /** In the order coverage gives them: the least covered first. */
  readonly items: readonly SnapshotFileDto[];
}
