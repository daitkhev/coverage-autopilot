import type { CoverageSnapshotDto } from '#coverage/application/contracts/coverage-public-api';
import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';

/**
 * A repository as a person sees it: what its own module keeps, and what
 * only the coverage module knows of it.
 */
export interface RepositoryViewDto extends RepositoryDto {
  /** The newest snapshot, split under the threshold of the settings. */
  readonly latestSnapshot: CoverageSnapshotDto | null;
  /** Its scan that has not ended: the running one, else the oldest queued. */
  readonly activeScanId: string | null;
  /** The head read last is not the commit of the newest snapshot. */
  readonly outdated: boolean;
}
