import type { RepositoryId } from '#kernel/primitives/repository-id';

export interface CheckAccessCommand {
  readonly repositoryId: RepositoryId;
}
