import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
  type SnapshotFilesRequest,
} from '#coverage/application/contracts/coverage-public-api';
import type { SnapshotFilesDto } from '#improvement/application/dto/snapshot-files.dto';
import { snapshotFilesDtoOf } from '#improvement/application/dto/snapshot-files-dto-mapping';
import type { ListSnapshotFilesQuery } from '#improvement/application/queries/list-snapshot-files/list-snapshot-files.query';
import { requestValueOrNull } from '#improvement/application/request-values';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';

/** What coverage is asked, with the filters the query gives and no other. */
function filesRequestOf(
  snapshotId: string,
  query: ListSnapshotFilesQuery,
): SnapshotFilesRequest {
  const { below, metric, state } = query;
  return {
    snapshotId,
    ...(below === undefined ? {} : { below }),
    ...(metric === undefined ? {} : { metric }),
    ...(state === undefined ? {} : { state }),
  };
}

/**
 * The files of a snapshot with the work on each. Coverage lists the files
 * and names the repository of the snapshot; a measured file gets the
 * newest improvement of its path in that repository, which only this
 * module knows. The improvements of the repository are read once for the
 * whole list. `null` when no snapshot has the id, also when the id is no
 * id of a snapshot at all.
 */
@Injectable()
export class ListSnapshotFilesHandler {
  private readonly coverage: CoveragePublicApi;
  private readonly improvements: ImprovementRepository;

  public constructor(
    @Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi,
    @Inject(IMPROVEMENT_REPOSITORY) improvements: ImprovementRepository,
  ) {
    this.coverage = coverage;
    this.improvements = improvements;
  }

  public async execute(
    query: ListSnapshotFilesQuery,
  ): Promise<SnapshotFilesDto | null> {
    const id = requestValueOrNull(() => SnapshotId.create(query.snapshotId));
    const snapshot =
      id === null
        ? null
        : await this.coverage.getSnapshot({ snapshotId: id.value });
    const files =
      snapshot === null
        ? null
        : await this.coverage.listSnapshotFiles(
            filesRequestOf(snapshot.id, query),
          );
    if (snapshot === null || files === null) {
      return null;
    }
    const latest = await this.improvements.latestByTarget(
      snapshot.repositoryId,
    );
    return snapshotFilesDtoOf(files, latest);
  }
}
