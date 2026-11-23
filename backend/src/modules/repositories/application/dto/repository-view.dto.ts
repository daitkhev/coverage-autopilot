import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';
import type { RepositoryCoverageDto } from '#repositories/application/contracts/repository-coverage';

/**
 * A repository as a person sees it: what this module keeps, and what only
 * the coverage module knows of it.
 */
export interface RepositoryViewDto
  extends RepositoryDto, RepositoryCoverageDto {
  /** The head read last is not the commit of the newest snapshot. */
  readonly outdated: boolean;
}
