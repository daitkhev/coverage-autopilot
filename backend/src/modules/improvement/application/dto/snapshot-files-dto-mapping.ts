import type {
  MeasuredFileDto,
  SnapshotFilesDto as CoverageFilesDto,
} from '#coverage/contracts/coverage-public-api';
import type {
  ImprovementRefDto,
  MeasuredFileWorkDto,
  SnapshotFilesDto,
} from '#improvement/application/dto/snapshot-files.dto';
import type { LatestImprovement } from '#improvement/domain/repositories/improvement.repository';

function withWork(
  file: MeasuredFileDto,
  latestImprovement: ImprovementRefDto | null,
): MeasuredFileWorkDto {
  const { counters, ...rest } = file;
  return { ...rest, coverage: counters, latestImprovement };
}

/**
 * The files coverage listed, each measured one with the newest
 * improvement of its path. The improvements are joined by path, so the
 * files keep the order coverage gave them.
 */
export function snapshotFilesDtoOf(
  files: CoverageFilesDto,
  latest: readonly LatestImprovement[],
): SnapshotFilesDto {
  const work = new Map(
    latest.map((each): [string, ImprovementRefDto] => [
      each.targetFile.value,
      { id: each.id.value, status: each.status },
    ]),
  );
  return {
    snapshotId: files.snapshotId,
    threshold: files.threshold,
    items: files.files.map((file) =>
      file.state === 'measured'
        ? withWork(file, work.get(file.path.value) ?? null)
        : file,
    ),
  };
}
