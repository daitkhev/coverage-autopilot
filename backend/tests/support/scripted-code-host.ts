import type {
  AccountResult,
  CodeHost,
  ForkResult,
  LoginResult,
  OpenPullRequestRequest,
  OpenPullRequestResult,
  PullRequest,
  PullRequestRequest,
  PushPermissionResult,
} from '#repositories/application/ports/code-host.port';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

/** The account the scripted host is logged in with, and its fork. */
export const SCRIPTED_ACCOUNT = 'acme-bot';
export const SCRIPTED_FORK = RepositoryUrl.parse(
  'https://github.com/acme-bot/widgets',
);

function keyOf(request: PullRequestRequest): string {
  return `${request.url.fullName} ${request.branch.value}`;
}

/**
 * The host of the code in memory. It keeps the pull requests it opened by
 * their repository and branch, so a second look finds them, and records
 * each call.
 */
export class ScriptedCodeHost implements CodeHost {
  public readonly calls: string[] = [];
  public loginAnswer: LoginResult = { outcome: 'logged_in' };
  public permissionAnswer: PushPermissionResult = { outcome: 'allowed' };
  public accountAnswer: AccountResult = {
    outcome: 'read',
    login: SCRIPTED_ACCOUNT,
  };
  public forkAnswer: ForkResult = { outcome: 'forked', fork: SCRIPTED_FORK };
  /** When set, opening a pull request is refused with it. */
  public openRefusal: string | null = null;
  /** By `<owner>/<name> <branch>`. */
  public readonly pullRequests = new Map<string, PullRequest>();

  public loginStatus(host: string): Promise<LoginResult> {
    this.calls.push(`loginStatus ${host}`);
    return Promise.resolve(this.loginAnswer);
  }

  public pushPermission(): Promise<PushPermissionResult> {
    this.calls.push('pushPermission');
    return Promise.resolve(this.permissionAnswer);
  }

  public account(host: string): Promise<AccountResult> {
    this.calls.push(`account ${host}`);
    return Promise.resolve(this.accountAnswer);
  }

  public ensureFork(url: RepositoryUrl): Promise<ForkResult> {
    this.calls.push(`ensureFork ${url.fullName}`);
    return Promise.resolve(this.forkAnswer);
  }

  public findPullRequest(
    request: PullRequestRequest,
  ): Promise<PullRequest | null> {
    this.calls.push(
      `findPullRequest ${request.url.fullName} ${request.branch.value}`,
    );
    return Promise.resolve(this.pullRequests.get(keyOf(request)) ?? null);
  }

  public openPullRequest(
    request: OpenPullRequestRequest,
  ): Promise<OpenPullRequestResult> {
    this.calls.push(
      `openPullRequest ${request.url.fullName} ${request.branch.value} into ${request.base.value}: ${request.title}`,
    );
    if (this.openRefusal !== null) {
      return Promise.resolve({ outcome: 'refused', output: this.openRefusal });
    }
    const number = this.pullRequests.size + 1;
    const pullRequest = {
      number,
      url: `https://github.com/${request.url.fullName}/pull/${String(number)}`,
    };
    this.pullRequests.set(keyOf(request), pullRequest);
    return Promise.resolve({ outcome: 'opened', pullRequest });
  }
}
