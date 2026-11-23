import { Inject, Injectable } from '@nestjs/common';

import type { CommitSha } from '#kernel/primitives/commit-sha';
import {
  REPOSITORY_COVERAGE,
  type RepositoryCoverage,
} from '#repositories/application/contracts/repository-coverage';
import {
  DEFAULT_INSTALL,
  type DefaultInstall,
} from '#repositories/application/default-install';
import {
  DEFAULT_THRESHOLD,
  type DefaultThreshold,
} from '#repositories/application/default-threshold';
import { toRepositoryDto } from '#repositories/application/dto/repository-dtos';
import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';
import type { Repository } from '#repositories/domain/entities/repository.entity';

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
 * Adds to a repository what the coverage module knows of it, and whether
 * it is outdated. The head is the one the repository keeps, so no host is
 * asked, and its threshold is the one the coverage module splits by.
 */
@Injectable()
export class RepositoryViews {
  private readonly coverage: RepositoryCoverage;
  private readonly threshold: DefaultThreshold;
  private readonly install: DefaultInstall;

  public constructor(
    @Inject(REPOSITORY_COVERAGE) coverage: RepositoryCoverage,
    @Inject(DEFAULT_THRESHOLD) threshold: DefaultThreshold,
    @Inject(DEFAULT_INSTALL) install: DefaultInstall,
  ) {
    this.coverage = coverage;
    this.threshold = threshold;
    this.install = install;
  }

  public async viewOf(repository: Repository): Promise<RepositoryViewDto> {
    const values = toRepositoryDto(repository, this.threshold, this.install);
    const coverage = await this.coverage.coverageOf(values);
    return {
      ...values,
      ...coverage,
      outdated: isOutdated(
        values.headCommit,
        coverage.latestSnapshot?.commit ?? null,
      ),
    };
  }
}
