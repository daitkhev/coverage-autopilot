import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import type { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';

export interface CreateCopyRequest {
  readonly id: WorkingCopyId;
  readonly repositoryId: RepositoryId;
  readonly url: RepositoryUrl;
  /** Brought from the host first when the commit is not known yet. */
  readonly branch: BranchName;
  readonly commit: CommitSha;
}

export interface ExtractedPatch {
  readonly text: string;
  /** The SHA-256 of the text, in lower-case hex. */
  readonly hash: string;
  readonly files: readonly FilePath[];
}

export type CopyPatchResult =
  | { readonly outcome: 'extracted'; readonly patch: ExtractedPatch }
  | { readonly outcome: 'empty' };

export type CopyApplyResult =
  | { readonly outcome: 'applied'; readonly files: readonly FilePath[] }
  | { readonly outcome: 'refused'; readonly reason: string };

export interface PushRequest {
  readonly id: WorkingCopyId;
  readonly url: RepositoryUrl;
  readonly branch: BranchName;
  readonly commitMessage: string;
}

/** `refused`: the host would not take the branch, and git said why. */
export type PushResult =
  | { readonly outcome: 'pushed' }
  | { readonly outcome: 'refused'; readonly reason: string };

/**
 * The folders of working copies: clean clones at one commit, each in a
 * folder of its own under one root. A copy is not stored anywhere else,
 * so its id is all it takes to find it again.
 */
export interface WorkingCopies {
  /**
   * Makes a clean clone at the commit in the folder of the id, in place
   * of whatever an earlier try left there, and gives its absolute path.
   */
  create(request: CreateCopyRequest, signal: AbortSignal): Promise<string>;

  /** Removes the folder. A copy that is gone already is no fault. */
  dispose(id: WorkingCopyId): Promise<void>;

  /** The changes against the commit of the copy, new files included. */
  extractPatch(id: WorkingCopyId): Promise<CopyPatchResult>;

  /** Applies all of the patch or nothing of it. */
  applyPatch(id: WorkingCopyId, patchText: string): Promise<CopyApplyResult>;

  /** Commits every change of the copy and pushes it as a new branch. */
  commitAndPush(request: PushRequest, signal: AbortSignal): Promise<PushResult>;
}

/** The injection token of the working copies. */
export const WORKING_COPIES = Symbol('WorkingCopies');
