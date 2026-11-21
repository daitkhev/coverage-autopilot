import type {
  ImportKind,
  ImportRecord,
  Manifest,
  Project,
  Rule,
  SourceFile,
} from '#harness/architecture/project';

interface ImportShape {
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly line?: number;
  readonly target?: string;
  readonly typeOnly?: boolean;
  readonly names?: readonly string[];
}

export function importOf(shape: ImportShape): ImportRecord {
  return {
    specifier: shape.specifier,
    kind: shape.kind,
    line: shape.line ?? 1,
    target: shape.target,
    typeOnly: shape.typeOnly ?? false,
    names: shape.names ?? [],
  };
}

/** An alias import that leads to an existing file. */
export function importTo(target: string, line = 1): ImportRecord {
  return importOf({ specifier: `#${target}`, kind: 'alias', line, target });
}

/** An import of names from a package, or from a module built into Node. */
export function importFrom(
  specifier: string,
  ...names: readonly string[]
): ImportRecord {
  const kind = specifier.startsWith('node:') ? 'builtin' : 'package';
  return importOf({ specifier, kind, names });
}

export function sourceFile(
  path: string,
  imports: readonly ImportRecord[] = [],
): SourceFile {
  return { path, imports };
}

/** A project that holds nothing. A test adds the part it is about. */
const EMPTY: Project = {
  files: [],
  manifests: [],
  paths: [],
  links: new Map(),
  lockfile: undefined,
};

export function projectOf(...files: readonly SourceFile[]): Project {
  return { ...EMPTY, files };
}

/** A project that is only a list of paths, some of them links. */
export function projectOfPaths(
  paths: readonly string[],
  links: Readonly<Record<string, string>> = {},
): Project {
  const all = [...paths, ...Object.keys(links)].sort();
  return { ...EMPTY, paths: all, links: new Map(Object.entries(links)) };
}

/** A project that is only a lockfile. */
export function projectWithLockfile(lockfile: unknown): Project {
  return { ...EMPTY, lockfile };
}

export function manifestOf(path: string, content: unknown): Manifest {
  return { path, content };
}

export function projectWith(...manifests: readonly Manifest[]): Project {
  return { ...EMPTY, manifests };
}

/** What a rule says about one file that imports another. */
export function detailsBetween(rule: Rule, from: string, to: string): string[] {
  return rule
    .check(projectOf(sourceFile(from, [importTo(to)])))
    .map((finding) => finding.detail);
}
