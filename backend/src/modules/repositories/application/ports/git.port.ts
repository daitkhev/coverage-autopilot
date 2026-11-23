import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import type { RevisionFacts } from '#repositories/domain/value-objects/revision-assessment.vo';

/** `missing`: no program answered to the name it was given. */
export type GitVersionResult =
  | { readonly outcome: 'found'; readonly version: string }
  | { readonly outcome: 'missing' };

/** `refused`: git could not read the repository, and said why. */
export type DefaultBranchResult =
  | { readonly outcome: 'read'; readonly branch: BranchName }
  | { readonly outcome: 'refused'; readonly output: string };

export interface BranchRequest {
  readonly url: RepositoryUrl;
  readonly branch: BranchName;
}

/** `absent`: the repository answered and has no such branch. */
export type BranchHeadResult =
  | { readonly outcome: 'read'; readonly commit: CommitSha }
  | { readonly outcome: 'absent' }
  | { readonly outcome: 'refused'; readonly output: string };

export interface RevisionRequest extends BranchRequest {
  readonly repositoryId: RepositoryId;
  readonly snapshotCommit: CommitSha;
  readonly targetFile: FilePath;
}

/**
 * The `git` program, for what it reads from the host of the code. Output
 * it gives back as `output` holds no secret of its environment.
 */
export interface Git {
  version(signal: AbortSignal): Promise<GitVersionResult>;

  /** The branch that the `HEAD` of the repository on the host names. */
  readDefaultBranch(
    url: RepositoryUrl,
    signal: AbortSignal,
  ): Promise<DefaultBranchResult>;

  /** The commit a branch of the repository on the host points to. */
  readBranchHead(
    request: BranchRequest,
    signal: AbortSignal,
  ): Promise<BranchHeadResult>;

  /**
   * Brings the branch from the host and compares the commit of a snapshot
   * with its head. A host that cannot be read is a fault here, because the
   * access check has already passed.
   */
  compareRevisions(
    request: RevisionRequest,
    signal: AbortSignal,
  ): Promise<RevisionFacts>;
}

/** The injection token of the `git` program. */
export const GIT = Symbol('Git');
