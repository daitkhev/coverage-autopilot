import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { RepositoryId } from '#kernel/primitives/repository-id';

export interface CreateWorkingCopyCommand {
  readonly repositoryId: RepositoryId;
  readonly commit: CommitSha;
  /** Who asks. It names the folder, and two purposes never share one. */
  readonly purpose: string;
}
