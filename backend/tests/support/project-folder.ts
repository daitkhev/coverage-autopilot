import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A folder of files that a test writes, removed by `remove`. */
export interface ProjectFolder {
  readonly root: string;
  write(path: string, content: string): void;
  remove(): void;
}

/** A project with the files a test names, by their path in the folder. */
export function createProjectFolder(
  files: Readonly<Record<string, string>> = {},
): ProjectFolder {
  const root = mkdtempSync(join(tmpdir(), 'coverage-project-'));
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  for (const [path, content] of Object.entries(files)) {
    write(path, content);
  }
  return {
    root,
    write,
    remove: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** A `package-lock.json` of npm that locks each package at its version. */
export function lockfileOf(versions: Readonly<Record<string, string>>): string {
  const packages = Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [
      `node_modules/${name}`,
      { version },
    ]),
  );
  return JSON.stringify({
    name: 'widgets',
    lockfileVersion: 3,
    packages: { '': { name: 'widgets' }, ...packages },
  });
}
