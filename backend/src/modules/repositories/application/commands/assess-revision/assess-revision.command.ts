import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';

export interface AssessRevisionCommand {
  readonly repositoryId: RepositoryId;
  readonly snapshotCommit: CommitSha;
  readonly targetFile: FilePath;
}
