import type {
  CoverageThresholdDto,
  FileCoverageDto,
  MeasuredFileDto,
} from '#coverage/application/contracts/coverage-public-api';
import type { ImprovementRefDto } from '#coverage/application/contracts/file-improvements';

/** A measured file with the newest improvement of its path, or `null`. */
interface MeasuredFileWorkDto extends MeasuredFileDto {
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
  /**
   * The least covered in the metric of the threshold first. A file with
   * nothing of that metric to count, of any state, comes after, by path.
   */
  readonly items: readonly SnapshotFileDto[];
}
