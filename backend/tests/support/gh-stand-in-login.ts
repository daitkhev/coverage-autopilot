/**
 * The login of the stand-in of `gh`: what its status says, and what every
 * command says when there is no login.
 */

const NOT_AUTHENTICATED = 4;
const FAILED = 1;

interface LoginAnswer {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

export interface StatusRequest {
  /** What `auth status` prints first, as gh names the account. */
  readonly statusText: string;
  /** Another account of the host whose login broke, if any. */
  readonly brokenAccount: string | null;
  /** Whether the status was asked for the active account alone. */
  readonly activeAlone: boolean;
}

/** gh judges every account of the host unless it is asked for the active one. */
export function loginStatus(request: StatusRequest): LoginAnswer {
  const { brokenAccount, statusText, activeAlone } = request;
  return brokenAccount === null || activeAlone
    ? { exitCode: 0, stdout: statusText }
    : {
        exitCode: FAILED,
        stdout: statusText,
        stderr: `  X Failed to log in to github.com account ${brokenAccount} (keyring)\n`,
      };
}

export function loggedOut(command: string, statusText: string): LoginAnswer {
  return command === 'auth status'
    ? {
        exitCode: FAILED,
        stderr: `${statusText}You are not logged into any GitHub hosts.\n`,
      }
    : {
        exitCode: NOT_AUTHENTICATED,
        stderr: 'To get started with GitHub CLI, please run: gh auth login\n',
      };
}
