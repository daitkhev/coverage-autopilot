import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { parseExports } from '#harness/architecture/exports';
import { listFiles } from '#harness/architecture/files';
import type { Structure } from '#harness/shared/structure';

/** What the baseline records: lists, and no number. */
export interface Lists {
  /** The names each module exports from its `contracts/`, sorted. */
  readonly contracts: Readonly<Record<string, readonly string[]>>;
  /** The SHA-256 of each migration, by its path. */
  readonly migrations: Readonly<Record<string, string>>;
}

const MIGRATION = '.sql';

interface Tree {
  readonly root: string;
  readonly files: readonly string[];
}

function contractsOf(tree: Tree, structure: Structure): [string, string[]][] {
  const { backend } = structure;
  return [...backend.modules.keys()].sort().map((module) => {
    const folder = `${backend.source}modules/${module}/contracts/`;
    const names = tree.files
      .filter((path) => path.startsWith(folder))
      .filter((path) => structure.extensions.includes(posix.extname(path)))
      .flatMap((path) =>
        parseExports(path, readFileSync(join(tree.root, path), 'utf8')),
      );
    return [module, [...new Set(names)].sort()];
  });
}

function migrationsOf(tree: Tree, folder: string): [string, string][] {
  return tree.files
    .filter((path) => path.startsWith(folder) && path.endsWith(MIGRATION))
    .map((path) => {
      const bytes = readFileSync(join(tree.root, path));
      return [path, createHash('sha256').update(bytes).digest('hex')];
    });
}

/** The lists of the tree under `root`, as it is now. */
export function listsOf(root: string, structure: Structure): Lists {
  const files = listFiles(root).filter((path) => existsSync(join(root, path)));
  const tree = { root, files };
  return {
    contracts: Object.fromEntries(contractsOf(tree, structure)),
    migrations: Object.fromEntries(
      migrationsOf(tree, structure.backend.migrations),
    ),
  };
}
