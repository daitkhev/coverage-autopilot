import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CommitSha } from '#kernel/primitives/commit-sha';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';
import {
  REPOSITORY_COVERAGE,
  type RepositoryCoverage,
  type RepositoryCoverageDto,
  type SnapshotSummaryDto,
} from '#repositories/application/contracts/repository-coverage';

describe('RepositoryCoverage', () => {
  it('should be injected by a token of its own', () => {
    expect(REPOSITORY_COVERAGE.description).toBe('RepositoryCoverage');
    expect(REPOSITORY_COVERAGE).not.toBe(REPOSITORIES_PUBLIC_API);
  });

  it('should be asked with the repository as it was read, its threshold too', () => {
    expectTypeOf<RepositoryCoverage['coverageOf']>().parameters.toEqualTypeOf<
      [RepositoryDto]
    >();
    expectTypeOf<
      RepositoryCoverage['coverageOf']
    >().returns.resolves.toEqualTypeOf<RepositoryCoverageDto>();
  });

  it('should give a repository never scanned no snapshot and no scan', () => {
    expectTypeOf<
      RepositoryCoverageDto['latestSnapshot']
    >().toEqualTypeOf<SnapshotSummaryDto | null>();
    expectTypeOf<RepositoryCoverageDto['activeScanId']>().toEqualTypeOf<
      string | null
    >();
  });

  it('should give the commit of a snapshot, so the head can be compared', () => {
    expectTypeOf<SnapshotSummaryDto['commit']>().toEqualTypeOf<CommitSha>();
  });
});
