import { Inject, Injectable } from '@nestjs/common';

import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import { thresholdOf } from '#coverage/application/repository-thresholds';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';
import {
  REPOSITORY_COVERAGE,
  type RepositoryCoverage,
  type RepositoryCoverageDto,
} from '#repositories/application/contracts/repository-coverage';

/**
 * What this module knows of a repository, for the port the module of
 * repositories declares: its newest snapshot and its scan that has not
 * ended.
 */
@Injectable()
export class RepositoryCoverageApi implements RepositoryCoverage {
  /**
   * The token of the port. The module file binds this class to it, and
   * reaches the contract of the module below through this layer only.
   */
  public static readonly token = REPOSITORY_COVERAGE;

  private readonly snapshots: CoverageSnapshotRepository;
  private readonly queue: JobQueue;

  public constructor(
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(JOB_QUEUE) queue: JobQueue,
  ) {
    this.snapshots = snapshots;
    this.queue = queue;
  }

  /** The subject of a scan job is its repository. */
  public async coverageOf(
    repository: RepositoryDto,
  ): Promise<RepositoryCoverageDto> {
    const latest = await this.snapshots.findNewestOf(repository.id);
    const scan = await this.queue.getOpenJob(repository.id.value, 'scan');
    return {
      latestSnapshot:
        latest === null ? null : snapshotDtoOf(latest, thresholdOf(repository)),
      activeScanId: scan?.id ?? null,
    };
  }
}
