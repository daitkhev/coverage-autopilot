import { Inject, Injectable } from '@nestjs/common';

import type { CommitSha } from '#kernel/primitives/commit-sha';
import {
  REPOSITORY_COVERAGE,
  type RepositoryCoverage,
} from '#repositories/application/contracts/repository-coverage';
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
 * asked.
 */
@Injectable()
export class RepositoryViews {
  private readonly coverage: RepositoryCoverage;

  public constructor(
    @Inject(REPOSITORY_COVERAGE) coverage: RepositoryCoverage,
  ) {
    this.coverage = coverage;
  }

  public async viewOf(repository: Repository): Promise<RepositoryViewDto> {
    const values = toRepositoryDto(repository);
    const coverage = await this.coverage.coverageOf(values.id);
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
