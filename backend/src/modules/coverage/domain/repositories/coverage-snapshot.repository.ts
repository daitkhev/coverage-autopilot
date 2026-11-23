import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import type { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Transaction } from '#kernel/transaction/transaction';

/** Where snapshots are kept. A snapshot is saved once and never changed. */
export interface CoverageSnapshotRepository {
  /**
   * Saves a new snapshot and returns the one stored under its origin key.
   * When a snapshot with that key is there already, nothing changes and
   * that one is returned: a late duplicate of a scan saves nothing.
   */
  save(
    snapshot: CoverageSnapshot,
    transaction: Transaction,
  ): Promise<CoverageSnapshot>;
  findById(id: SnapshotId): Promise<CoverageSnapshot | null>;
  findByOriginKey(originKey: string): Promise<CoverageSnapshot | null>;
  /**
   * The snapshots of a repository, the newest first. Of two captured at
   * the same moment, the one with the greater id comes first.
   */
  listByRepository(repositoryId: RepositoryId): Promise<CoverageSnapshot[]>;
  /**
   * The first of that list, read alone: a list of repositories shows the
   * newest snapshot of each and would otherwise load every one.
   */
  findNewestOf(repositoryId: RepositoryId): Promise<CoverageSnapshot | null>;
}

/** The injection token of the repository of snapshots. */
export const COVERAGE_SNAPSHOT_REPOSITORY = Symbol(
  'CoverageSnapshotRepository',
);
