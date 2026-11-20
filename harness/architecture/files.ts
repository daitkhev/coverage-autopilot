import { execFileSync } from 'node:child_process';

/**
 * The files of a tree as git sees them: tracked files and new files that git
 * does not ignore, sorted. A file counts from the moment it is written.
 */
export function listFiles(root: string): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  );
  return output
    .split('\0')
    .filter((path) => path !== '')
    .sort();
}
