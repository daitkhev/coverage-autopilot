import type { RepositoryId } from '#kernel/primitives/repository-id';

export interface GetRepositoryQuery {
  readonly repositoryId: RepositoryId;
}
