import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import {
  type Alias,
  aliasesOf,
  kindOf,
  resolveAlias,
} from '#harness/architecture/aliases';
import { listFiles } from '#harness/architecture/files';
import { parseImports } from '#harness/architecture/imports';
import type {
  ImportRecord,
  Manifest,
  Project,
  SourceFile,
} from '#harness/architecture/project';
import type { Structure } from '#harness/shared/structure';

const MANIFEST = 'package.json';

interface Tree {
  readonly root: string;
  readonly files: ReadonlySet<string>;
  readonly manifests: readonly Manifest[];
  /** Aliases by the folder of the `package.json` that declares them. */
  readonly aliases: ReadonlyMap<string, readonly Alias[]>;
}

function isSource(path: string, structure: Structure): boolean {
  const excluded = structure.excluded.some((prefix) => path.startsWith(prefix));
  return !excluded && structure.extensions.includes(posix.extname(path));
}

function folderOf(path: string): string {
  const folder = posix.dirname(path);
  return folder === '.' ? '' : folder;
}

function treeOf(root: string, files: readonly string[]): Tree {
  const manifests = files
    .filter((path) => posix.basename(path) === MANIFEST)
    .map((path): Manifest => {
      const text = readFileSync(join(root, path), 'utf8');
      return { path, content: JSON.parse(text) as unknown };
    });
  const aliases = new Map(
    manifests.map((manifest) => {
      const folder = folderOf(manifest.path);
      return [folder, aliasesOf(manifest.content, folder)] as const;
    }),
  );
  return { root, files: new Set(files), manifests, aliases };
}

/** The aliases of the nearest `package.json` at or above a file. */
function aliasesFor(tree: Tree, path: string): readonly Alias[] {
  let folder = folderOf(path);
  while (!tree.aliases.has(folder) && folder !== '') {
    folder = folderOf(folder);
  }
  return tree.aliases.get(folder) ?? [];
}

function sourceFileOf(tree: Tree, path: string): SourceFile {
  const text = readFileSync(join(tree.root, path), 'utf8');
  const aliases = aliasesFor(tree, path);
  const imports = parseImports(path, text).map((parsed): ImportRecord => {
    const kind = kindOf(parsed.specifier);
    const named =
      kind === 'alias' ? resolveAlias(parsed.specifier, aliases) : undefined;
    const exists = named !== undefined && tree.files.has(named);
    return { ...parsed, kind, target: exists ? named : undefined };
  });
  return { path, imports };
}

/** Reads the tree under `root` into the model the rules work on. */
export function loadProject(root: string, structure: Structure): Project {
  const files = listFiles(root).filter((path) => existsSync(join(root, path)));
  const tree = treeOf(root, files);
  return {
    files: files
      .filter((path) => isSource(path, structure))
      .map((path) => sourceFileOf(tree, path)),
    manifests: tree.manifests,
  };
}
