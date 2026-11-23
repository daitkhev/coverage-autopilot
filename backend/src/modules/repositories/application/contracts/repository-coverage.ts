import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { Instant } from '#kernel/time/instant';
import type {
  CoverageMetric,
  RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';

interface CoverageCounterDto {
  readonly covered: number;
  readonly total: number;
  /** `null` when the total is zero: no code of that kind is not 0%. */
  readonly percentage: number | null;
}

/** The newest snapshot of a repository, as far as its answer shows it. */
export interface SnapshotSummaryDto {
  readonly id: string;
  readonly commit: CommitSha;
  readonly capturedAt: Instant;
  /** Over measured files only. */
  readonly totals: Readonly<Record<CoverageMetric, CoverageCounterDto>>;
  readonly threshold: {
    readonly metric: CoverageMetric;
    readonly percentage: number;
  };
  /** How the files divide under the threshold. */
  readonly files: {
    readonly below: number;
    readonly above: number;
    readonly unmeasured: number;
    readonly noCode: number;
  };
  /** How many tests ran and failed, `null` when they were not counted. */
  readonly tests: {
    readonly ran: number;
    readonly failed: number;
  } | null;
}

/** What only the coverage module knows of a repository. */
export interface RepositoryCoverageDto {
  /** The newest snapshot, split under the threshold of the repository. */
  readonly latestSnapshot: SnapshotSummaryDto | null;
  /** Its scan that has not ended: the running one, else the oldest queued. */
  readonly activeScanId: string | null;
}

/**
 * The coverage of a repository, which a person sees with it. This module
 * declares the port and the coverage module, which is above it, answers
 * it, so the routes of a repository stay in the module of repositories.
 * It is given the repository as it was read, so the snapshot is split
 * under the very threshold the answer shows.
 */
export interface RepositoryCoverage {
  coverageOf(repository: RepositoryDto): Promise<RepositoryCoverageDto>;
}

/** The injection token of the coverage of a repository. */
export const REPOSITORY_COVERAGE = Symbol('RepositoryCoverage');
