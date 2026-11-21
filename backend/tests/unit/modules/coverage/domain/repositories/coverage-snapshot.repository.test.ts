import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { Transaction } from '#kernel/transaction/transaction';

describe('CoverageSnapshotRepository', () => {
  it('should be injected by a token of its own', () => {
    expect(COVERAGE_SNAPSHOT_REPOSITORY.description).toBe(
      'CoverageSnapshotRepository',
    );
  });

  it('should save in the transaction of the caller', () => {
    expectTypeOf<CoverageSnapshotRepository['save']>()
      .parameter(1)
      .toEqualTypeOf<Transaction>();
  });

  it('should answer a snapshot that is not there with null', () => {
    expectTypeOf<
      CoverageSnapshotRepository['findByOriginKey']
    >().returns.resolves.toEqualTypeOf<CoverageSnapshot | null>();
  });
});
