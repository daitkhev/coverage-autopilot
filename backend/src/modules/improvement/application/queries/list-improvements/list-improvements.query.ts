import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';

/**
 * What the list is narrowed to, as the route gives it. A field left out
 * narrows nothing, and the history of one file is the list of its path.
 */
export interface ListImprovementsQuery {
  readonly repositoryId?: string | undefined;
  readonly status?: ImprovementStatus | undefined;
  readonly filePath?: string | undefined;
}
