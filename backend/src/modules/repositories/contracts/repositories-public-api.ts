import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';

export interface RepositoryDto {
  readonly id: RepositoryId;
  readonly owner: string;
  readonly name: string;
  readonly url: string;
  readonly defaultBranch: string;
  readonly connectedAt: Instant;
  /** The head of the default branch as it was last read, with the moment. */
  readonly headCommit: CommitSha | null;
  readonly headCheckedAt: Instant | null;
}

export interface RepositoryRequest {
  readonly repositoryId: RepositoryId;
}

export interface ConnectRepositoryRequest {
  /** The address as a person typed it. */
  readonly url: string;
}

/**
 * `already_connected`: the same owner and name were connected before, and
 * that repository is the answer. `invalid_url`: the text is not the
 * address of a repository on the host of the code. `unreachable`: git
 * could not read the repository. A refusal says why, in words for people.
 */
export type ConnectRepositoryResult =
  | {
      readonly outcome: 'connected' | 'already_connected';
      readonly repository: RepositoryDto;
    }
  | {
      readonly outcome: 'invalid_url' | 'unreachable';
      readonly reason: string;
    };

type AccessStepName = 'git_present' | 'gh_authenticated' | 'push_allowed';

/** A failed step stops the rest, so a later step may never run. */
type AccessStepStatus = 'passed' | 'failed' | 'not_run';

interface AccessStepDto {
  readonly name: AccessStepName;
  readonly status: AccessStepStatus;
  readonly message: string | null;
  /** The answer of the tool that refused, so the user can act on it. */
  readonly toolOutput: string | null;
}

export interface AccessCheckDto {
  readonly repositoryId: RepositoryId;
  readonly checkedAt: Instant;
  readonly passed: boolean;
  /** Read with the last step, so a check that stopped early has none. */
  readonly headCommit: CommitSha | null;
  readonly steps: readonly AccessStepDto[];
}

export interface AssessRevisionRequest {
  readonly repositoryId: RepositoryId;
  /** The commit of the snapshot the improvement works from. */
  readonly snapshotCommit: CommitSha;
  readonly targetFile: FilePath;
}

/**
 * `current`: the head is the snapshot commit. `unchanged`: the head moved
 * and the file is the same. `stale`: the file changed. `diverged`: the
 * snapshot commit is not an ancestor of the head. The first two go on.
 */
export interface RevisionAssessmentDto {
  readonly outcome: 'current' | 'unchanged' | 'stale' | 'diverged';
  readonly headCommit: CommitSha;
}

export interface CreateWorkingCopyRequest {
  readonly repositoryId: RepositoryId;
  readonly commit: CommitSha;
  /**
   * Who asks, such as `scan:<id>` or `improvement:<id>:attempt:2`. It names
   * the folder and the lines of the log, and two requests never share one.
   */
  readonly purpose: string;
}

/**
 * A clean clone at one commit, private to the module that asked for it.
 * That module disposes of it. A module it lends the copy to uses it for
 * one call and keeps no reference.
 */
export interface WorkingCopyDto {
  readonly id: string;
  readonly repositoryId: RepositoryId;
  readonly commit: CommitSha;
  /** The absolute path of the root of the clone. */
  readonly path: string;
}

export interface WorkingCopyRequest {
  readonly workingCopyId: string;
}

/** The diff of a working copy against its commit, new files included. */
export interface PatchDto {
  readonly text: string;
  /** The SHA-256 of the text, in lower-case hex. */
  readonly hash: string;
  readonly files: readonly FilePath[];
}

/** `empty`: the working copy is as its commit left it. */
export type ExtractPatchResult =
  | { readonly outcome: 'extracted'; readonly patch: PatchDto }
  | { readonly outcome: 'empty' };

export interface ApplyPatchRequest {
  readonly workingCopyId: string;
  readonly patchText: string;
}

/** `refused`: git would not apply the text, and the copy is unchanged. */
export type ApplyPatchResult =
  | { readonly outcome: 'applied'; readonly files: readonly FilePath[] }
  | { readonly outcome: 'refused'; readonly reason: string };

export interface PublishPatchRequest {
  readonly repositoryId: RepositoryId;
  readonly baseCommit: CommitSha;
  readonly patchText: string;
  readonly branchName: string;
  readonly commitMessage: string;
  readonly title: string;
  readonly body: string;
}

/**
 * `published` also when the branch and the pull request were made by an
 * earlier call: publishing looks for them first and returns them.
 */
export type PublishPatchResult =
  | {
      readonly outcome: 'published';
      readonly branchName: string;
      readonly pullRequestUrl: string;
      readonly pullRequestNumber: number;
    }
  | { readonly outcome: 'refused'; readonly reason: string };

/**
 * Everything that uses `git` and `gh`, as the other modules see it.
 *
 * `null` means not found, a value with an `outcome` is an expected result,
 * and a fault is a typed error with a `code` and a `retryable` flag. An
 * operation that can be stopped takes a signal, stops, releases what it
 * holds and throws.
 */
export interface RepositoriesPublicApi {
  getRepository(request: RepositoryRequest): Promise<RepositoryDto | null>;

  /** The preflight: `git` is there, `gh` is logged in, a push is allowed. */
  checkAccess(
    request: RepositoryRequest,
    signal: AbortSignal,
  ): Promise<AccessCheckDto>;

  /**
   * Reads the head of the default branch from the host of the code, stores
   * it with the repository and returns it. A scan starts from it.
   */
  resolveHead(
    request: RepositoryRequest,
    signal: AbortSignal,
  ): Promise<CommitSha>;

  assessRevision(
    request: AssessRevisionRequest,
    signal: AbortSignal,
  ): Promise<RevisionAssessmentDto>;

  createWorkingCopy(
    request: CreateWorkingCopyRequest,
    signal: AbortSignal,
  ): Promise<WorkingCopyDto>;

  /** Removes the folder. A copy that is gone already is no fault. */
  disposeWorkingCopy(request: WorkingCopyRequest): Promise<void>;

  /**
   * A tree that holds a `.git` of its own, at any depth, was tampered
   * with: this and `applyPatch` then throw `working_copy_tampered` and do
   * not run git in it.
   */
  extractPatch(request: WorkingCopyRequest): Promise<ExtractPatchResult>;

  applyPatch(request: ApplyPatchRequest): Promise<ApplyPatchResult>;

  /**
   * Makes a clean clone at the base commit, applies the patch, commits,
   * pushes and opens the pull request. It never takes a diff from a folder
   * the generator or a test run has touched.
   */
  publishPatch(
    request: PublishPatchRequest,
    signal: AbortSignal,
  ): Promise<PublishPatchResult>;
}

/** The injection token of the contract of the repositories module. */
export const REPOSITORIES_PUBLIC_API = Symbol('RepositoriesPublicApi');

/**
 * Which repositories are connected, for the module that shows them to a
 * person. It is apart from `RepositoriesPublicApi`, because the modules
 * that work on one repository never connect or list one.
 */
export interface RepositoryConnectionsApi {
  /**
   * Reads the default branch from the host and connects the repository.
   * The same owner and name, in any case of letters, are connected once.
   */
  connectRepository(
    request: ConnectRepositoryRequest,
    signal: AbortSignal,
  ): Promise<ConnectRepositoryResult>;

  /** Every connected repository, the oldest connection first. */
  listRepositories(): Promise<RepositoryDto[]>;
}

/** The injection token of the connected repositories. */
export const REPOSITORY_CONNECTIONS_API = Symbol('RepositoryConnectionsApi');
