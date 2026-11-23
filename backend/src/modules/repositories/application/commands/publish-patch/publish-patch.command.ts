import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { RepositoryId } from '#kernel/primitives/repository-id';

export interface PublishPatchCommand {
  readonly repositoryId: RepositoryId;
  readonly baseCommit: CommitSha;
  readonly patchText: string;
  /** The same work always asks for the same branch. */
  readonly branchName: string;
  readonly commitMessage: string;
  readonly title: string;
  readonly body: string;
}
