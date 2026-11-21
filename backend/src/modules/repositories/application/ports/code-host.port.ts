import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

/** `logged_out` keeps the answer of the tool, so the user can act on it. */
export type LoginResult =
  | { readonly outcome: 'logged_in' }
  | { readonly outcome: 'logged_out'; readonly output: string }
  | { readonly outcome: 'missing' };

/** `refused`: the host did not say, for a reason in its answer. */
export type PushPermissionResult =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'denied' }
  | { readonly outcome: 'refused'; readonly output: string };

export interface PullRequest {
  readonly number: number;
  readonly url: string;
}

export interface PullRequestRequest {
  readonly url: RepositoryUrl;
  readonly branch: BranchName;
}

export interface OpenPullRequestRequest extends PullRequestRequest {
  readonly base: BranchName;
  readonly title: string;
  readonly body: string;
}

export type OpenPullRequestResult =
  | { readonly outcome: 'opened'; readonly pullRequest: PullRequest }
  | { readonly outcome: 'refused'; readonly output: string };

/**
 * The host of the code, as the `gh` program reaches it with the login of
 * the user. A login that is missing is a typed fault of every operation
 * but `loginStatus`, which answers it as a value.
 */
export interface CodeHost {
  loginStatus(host: string, signal: AbortSignal): Promise<LoginResult>;

  pushPermission(
    url: RepositoryUrl,
    signal: AbortSignal,
  ): Promise<PushPermissionResult>;

  /** The latest pull request from the branch, in any state, or `null`. */
  findPullRequest(
    request: PullRequestRequest,
    signal: AbortSignal,
  ): Promise<PullRequest | null>;

  openPullRequest(
    request: OpenPullRequestRequest,
    signal: AbortSignal,
  ): Promise<OpenPullRequestResult>;
}

/** The injection token of the host of the code. */
export const CODE_HOST = Symbol('CodeHost');
