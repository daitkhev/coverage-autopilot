import type { DynamicModule } from '@nestjs/common';

import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import {
  REPOSITORY_COVERAGE,
  type RepositoryCoverage,
  type RepositoryCoverageDto,
  type SnapshotSummaryDto,
} from '#repositories/application/contracts/repository-coverage';
import {
  fixtureSnapshot,
  TEST_THRESHOLD,
} from '#tests/support/coverage-snapshots';

/** What the coverage module answers a test, and every repository it was asked. */
export interface StandInRepositoryCoverage extends RepositoryCoverage {
  /** No snapshot and no scan until a test sets them. */
  answer: RepositoryCoverageDto;
  readonly asked: RepositoryId[];
}

/** The port of the repositories module as the coverage module answers it. */
export function standInRepositoryCoverage(): StandInRepositoryCoverage {
  const stand: StandInRepositoryCoverage = {
    answer: { latestSnapshot: null, activeScanId: null },
    asked: [],
    coverageOf: async (repository) => {
      stand.asked.push(repository.id);
      return Promise.resolve(stand.answer);
    },
  };
  return stand;
}

/**
 * The registered module of repositories with the coverage module as a
 * stand-in that answers its port, as the global coverage module does in
 * the service.
 */
export function withStandInCoverage(registered: DynamicModule): DynamicModule {
  const coverage = {
    provide: REPOSITORY_COVERAGE,
    useValue: standInRepositoryCoverage(),
  };
  return {
    ...registered,
    providers: [...(registered.providers ?? []), coverage],
  };
}

/**
 * The fixture snapshot at `SNAPSHOT_COMMIT`, split under the default
 * threshold of a test, as the coverage module gives it.
 */
export function latestSnapshot(): SnapshotSummaryDto {
  return snapshotDtoOf(fixtureSnapshot(), TEST_THRESHOLD);
}
