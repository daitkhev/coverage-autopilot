import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Settings that keep the git of the machine out of a test. */
const QUIET = [
  '-c',
  'user.name=harness',
  '-c',
  'user.email=harness@example.invalid',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

/** A git repository in a temporary folder, for one test. */
export interface TemporaryRepository {
  readonly root: string;
  readonly write: (path: string, text: string) => void;
  readonly remove: (path: string) => void;
  /** Commits everything and gives the name of the commit. */
  readonly commit: () => string;
  readonly dispose: () => void;
}

function git(root: string, ...rest: readonly string[]): string {
  return execFileSync('git', [...QUIET, ...rest], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

export function temporaryRepository(): TemporaryRepository {
  const root = mkdtempSync(join(tmpdir(), 'harness-'));
  git(root, 'init', '--quiet', '--initial-branch', 'main');
  return {
    root,
    write: (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    remove: (path) => {
      rmSync(join(root, path));
    },
    commit: () => {
      git(root, 'add', '--all');
      git(root, 'commit', '--quiet', '--allow-empty', '--message', 'state');
      return git(root, 'rev-parse', 'HEAD');
    },
    dispose: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
