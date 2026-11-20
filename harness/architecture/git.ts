import { spawnSync } from 'node:child_process';

const NO_COMMIT = /^0+$/;

/** True for the name git gives to "no commit", such as a new branch has. */
export function isNoCommit(ref: string): boolean {
  return NO_COMMIT.test(ref);
}

export function isCommit(root: string, ref: string): boolean {
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    { cwd: root, encoding: 'utf8' },
  );
  return result.status === 0;
}

/** The text a file had at a commit, when it was there. */
export function showFile(
  root: string,
  ref: string,
  path: string,
): string | undefined {
  const result = spawnSync('git', ['show', `${ref}:${path}`], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout : undefined;
}
