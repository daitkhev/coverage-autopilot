import type {
  CodeHost,
  LoginResult,
  OpenPullRequestRequest,
  OpenPullRequestResult,
  PullRequest,
  PullRequestRequest,
  PushPermissionResult,
} from '#repositories/application/ports/code-host.port';

/**
 * The host of the code in memory. It keeps the pull requests it opened by
 * their branch, so a second look finds them, and records each call.
 */
export class ScriptedCodeHost implements CodeHost {
  public readonly calls: string[] = [];
  public loginAnswer: LoginResult = { outcome: 'logged_in' };
  public permissionAnswer: PushPermissionResult = { outcome: 'allowed' };
  /** When set, opening a pull request is refused with it. */
  public openRefusal: string | null = null;
  public readonly pullRequests = new Map<string, PullRequest>();

  public loginStatus(host: string): Promise<LoginResult> {
    this.calls.push(`loginStatus ${host}`);
    return Promise.resolve(this.loginAnswer);
  }

  public pushPermission(): Promise<PushPermissionResult> {
    this.calls.push('pushPermission');
    return Promise.resolve(this.permissionAnswer);
  }

  public findPullRequest(
    request: PullRequestRequest,
  ): Promise<PullRequest | null> {
    this.calls.push(`findPullRequest ${request.branch.value}`);
    return Promise.resolve(this.pullRequests.get(request.branch.value) ?? null);
  }

  public openPullRequest(
    request: OpenPullRequestRequest,
  ): Promise<OpenPullRequestResult> {
    this.calls.push(
      `openPullRequest ${request.branch.value} into ${request.base.value}: ${request.title}`,
    );
    if (this.openRefusal !== null) {
      return Promise.resolve({ outcome: 'refused', output: this.openRefusal });
    }
    const number = this.pullRequests.size + 1;
    const pullRequest = {
      number,
      url: `https://github.com/${request.url.fullName}/pull/${String(number)}`,
    };
    this.pullRequests.set(request.branch.value, pullRequest);
    return Promise.resolve({ outcome: 'opened', pullRequest });
  }
}
