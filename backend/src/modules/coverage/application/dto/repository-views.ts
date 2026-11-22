import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import type { RepositoryViewDto } from '#coverage/application/dto/repository-view.dto';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
import type { RepositoryDto } from '#repositories/contracts/repositories-public-api';

/**
 * Outdated means the head moved past the newest snapshot. Without a head
 * that was read, or without a snapshot, nothing says it moved.
 */
function isOutdated(
  head: CommitSha | null,
  snapshotCommit: CommitSha | null,
): boolean {
  return (
    head !== null && snapshotCommit !== null && !head.equals(snapshotCommit)
  );
}

/**
 * Adds to a repository what the coverage module knows of it: its newest
 * snapshot, its scan that has not ended and whether it is outdated. The
 * head is the one the repository keeps, so no host is asked.
 */
@Injectable()
export class RepositoryViews {
  private readonly snapshots: CoverageSnapshotRepository;
  private readonly queue: JobQueue;
  private readonly settings: CoverageSettings;

  public constructor(
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(COVERAGE_SETTINGS) settings: CoverageSettings,
  ) {
    this.snapshots = snapshots;
    this.queue = queue;
    this.settings = settings;
  }

  /** The subject of a scan job is its repository. */
  public async viewOf(repository: RepositoryDto): Promise<RepositoryViewDto> {
    const [latest] = await this.snapshots.listByRepository(repository.id);
    const scan = await this.queue.getOpenJob(repository.id.value, 'scan');
    return {
      ...repository,
      latestSnapshot:
        latest === undefined
          ? null
          : snapshotDtoOf(latest, this.settings.threshold),
      activeScanId: scan?.id ?? null,
      outdated: isOutdated(repository.headCommit, latest?.commit ?? null),
    };
  }
}
