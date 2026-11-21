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

/** Whether the first commit is in the history of the second. */
export function isAncestor(
  root: string,
  older: string,
  newer: string,
): boolean {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', older, newer],
    { cwd: root },
  );
  return result.status === 0;
}

/** Whether a clone has only a part of its history. */
export function isShallow(root: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.stdout.trim() === 'true';
}

/** The branch a tree is on, or nothing when it is on no branch. */
export function currentBranch(root: string): string {
  const result = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
}
