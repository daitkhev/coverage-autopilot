import type { StoredImprovement } from '#tests/support/stored-work';
import type { TemporaryCodeHost } from '#tests/support/temporary-code-host';

/** A branch the service pushed to a remote, and what it holds. */
export interface PublishedBranch {
  readonly branch: string;
  /** Whether an improvement names it as its branch. */
  readonly owned: boolean;
  /** How many commits it has over the base commit of that improvement. */
  readonly commits: string;
  /** The files it changes over that base, as `git diff --name-status` says. */
  readonly changes: string;
}

/** Where the service pushes the branch of every improvement. */
const BRANCHES = 'refs/heads/coverage-autopilot/';

/** A branch no improvement owns is compared with the default branch. */
const NO_BASE = 'HEAD';

/** Every branch of the service on the remote of the repository `name`. */
export function publishedBranches(
  host: TemporaryCodeHost,
  name: string,
  improvements: readonly StoredImprovement[],
): PublishedBranch[] {
  const remote = host.remoteOf(name);
  return host
    .git(remote, 'for-each-ref', '--format=%(refname:short)', BRANCHES)
    .split('\n')
    .filter((branch) => branch !== '')
    .map((branch) => {
      const owner = improvements.find((each) => each.branch === branch);
      const base = owner?.baseCommit ?? NO_BASE;
      return {
        branch,
        owned: owner !== undefined,
        commits: host.git(remote, 'rev-list', '--count', `${base}..${branch}`),
        changes: host.git(remote, 'diff', '--name-status', base, branch),
      };
    });
}
