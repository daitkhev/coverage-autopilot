import type { RepositoryId } from '#kernel/primitives/repository-id';

export interface ResolveHeadCommand {
  readonly repositoryId: RepositoryId;
}
