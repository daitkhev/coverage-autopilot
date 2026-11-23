import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { parseExports } from '#harness/architecture/exports';
import { listFiles } from '#harness/architecture/files';
import type { Structure } from '#harness/shared/structure';

/** What the baseline records: lists, and no number. */
export interface Lists {
  /** The names each module exports from its contracts, sorted. */
  readonly contracts: Readonly<Record<string, readonly string[]>>;
  /**
   * The SHA-256 of each migration, by the name of its file. A migration
   * is the same one wherever the policy puts the folder of the migrations.
   */
  readonly migrations: Readonly<Record<string, string>>;
}

/** The lists of a tree, with the folder its migrations are in. */
export interface TreeLists extends Lists {
  /** As the policy names it, with a slash at the end. */
  readonly migrationsFolder: string;
}

const MIGRATION = '.sql';

interface Tree {
  readonly root: string;
  readonly files: readonly string[];
}

function contractsOf(tree: Tree, structure: Structure): [string, string[]][] {
  const { backend } = structure;
  return [...backend.modules.keys()].sort().map((module) => {
    const folders = backend.contracts.map(
      (layer) => `${backend.source}modules/${module}/${layer}/`,
    );
    const names = tree.files
      .filter((path) => folders.some((folder) => path.startsWith(folder)))
      .filter((path) => structure.extensions.includes(posix.extname(path)))
      .flatMap((path) =>
        parseExports(path, readFileSync(join(tree.root, path), 'utf8')),
      );
    return [module, [...new Set(names)].sort()];
  });
}

/** The files of the folder itself: the service applies no file below it. */
function migrationsOf(tree: Tree, folder: string): [string, string][] {
  return tree.files
    .filter((path) => path.startsWith(folder) && path.endsWith(MIGRATION))
    .map((path) => path.slice(folder.length))
    .filter((name) => !name.includes('/'))
    .map((name) => {
      const bytes = readFileSync(join(tree.root, folder, name));
      return [name, createHash('sha256').update(bytes).digest('hex')];
    });
}

/** The lists of the tree under `root`, as it is now. */
export function listsOf(root: string, structure: Structure): TreeLists {
  const files = listFiles(root).filter((path) => existsSync(join(root, path)));
  const tree = { root, files };
  const migrationsFolder = structure.backend.migrations;
  return {
    contracts: Object.fromEntries(contractsOf(tree, structure)),
    migrations: Object.fromEntries(migrationsOf(tree, migrationsFolder)),
    migrationsFolder,
  };
}
