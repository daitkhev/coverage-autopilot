import { type Dirent, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { FilePath } from '#kernel/primitives/file-path';

/**
 * The name of the rule below, stored with every snapshot. A change of the
 * rule takes a new name, because the same files under two rules give two
 * sets of numbers that do not compare.
 */
export const FILE_LIST_RULE = 'typescript-sources-v2';

/**
 * Folders of packages, of output, of tests and of tools, by the exact
 * name the tools give them: a folder such as `Build` is named by a person
 * and may hold the product.
 */
const NOT_SOURCES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'test',
  'tests',
  '__tests__',
  '__mocks__',
]);

/**
 * Folders of code that calls the product from outside, to show it, to
 * time it or to feed its tests. Nobody tests such code, so each of its
 * files would count below the threshold beside the files of the product,
 * and could be picked to be improved in their place. A person names such
 * a folder, so `Examples` is the same folder as `examples`.
 */
const OUTSIDE_THE_PRODUCT = new Set([
  'examples',
  'example',
  'demos',
  'demo',
  'samples',
  'sample',
  'benchmarks',
  'benchmark',
  'bench',
  'fixtures',
  '__fixtures__',
]);

const SOURCE = /\.(?:ts|tsx|mts|cts)$/u;

/** Declarations, tests and the configuration of tools hold nothing to test. */
const NOT_A_SOURCE =
  /(?:\.d\.[mc]?ts|\.(?:test|spec)\.[mc]?tsx?|\.config\.[mc]?ts)$/u;

function isSkippedFolder(entry: Dirent): boolean {
  const { name } = entry;
  return (
    entry.isDirectory() &&
    (name.startsWith('.') ||
      NOT_SOURCES.has(name) ||
      OUTSIDE_THE_PRODUCT.has(name.toLowerCase()))
  );
}

function isSource(entry: Dirent): boolean {
  return (
    entry.isFile() && SOURCE.test(entry.name) && !NOT_A_SOURCE.test(entry.name)
  );
}

/**
 * Every TypeScript source of a working copy by the rule above, sorted.
 * A link is not followed, so the list stays inside the copy. The project's
 * own coverage settings are not read: a configuration in JavaScript would
 * have to be run to be read, and nothing of the repository runs here.
 */
export function listSourceFiles(root: string): FilePath[] {
  const found: string[] = [];
  const folders = [''];
  for (
    let folder = folders.pop();
    folder !== undefined;
    folder = folders.pop()
  ) {
    const entries = readdirSync(join(root, folder), { withFileTypes: true });
    const inside = (entry: Dirent): string =>
      folder === '' ? entry.name : `${folder}/${entry.name}`;
    folders.push(
      ...entries
        .filter((entry) => entry.isDirectory() && !isSkippedFolder(entry))
        .map(inside),
    );
    found.push(...entries.filter(isSource).map(inside));
  }
  return found
    .sort((left, right) => Number(left > right) - Number(left < right))
    .map((path) => FilePath.create(path));
}
