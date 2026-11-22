import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
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
  public async coverageOf(
    repositoryId: RepositoryId,
  ): Promise<RepositoryCoverageDto> {
    const latest = await this.snapshots.findNewestOf(repositoryId);
    const scan = await this.queue.getOpenJob(repositoryId.value, 'scan');
    return {
      latestSnapshot:
        latest === null ? null : snapshotDtoOf(latest, this.settings.threshold),
      activeScanId: scan?.id ?? null,
    };
  }
}
