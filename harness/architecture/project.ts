import type { Finding } from '#harness/architecture/finding';

export type ImportKind = 'relative' | 'builtin' | 'package' | 'alias';

export interface ImportRecord {
  readonly specifier: string;
  readonly line: number;
  /** True for `import type` and `export type`: nothing is loaded at run. */
  readonly typeOnly: boolean;
  /**
   * What is taken from the module: the exported names, `default` for a
   * default import, `*` for a namespace, a re-export of all or `import()`.
   */
  readonly names: readonly string[];
  readonly kind: ImportKind;
  /** The file an alias leads to, when that file exists. */
  readonly target: string | undefined;
}

export interface SourceFile {
  readonly path: string;
  readonly imports: readonly ImportRecord[];
}

/** A `package.json` of the tree, as it was parsed. */
export interface Manifest {
  readonly path: string;
  readonly content: unknown;
}

export interface Project {
  readonly files: readonly SourceFile[];
  readonly manifests: readonly Manifest[];
}

export interface Rule {
  readonly id: string;
  readonly check: (project: Project) => readonly Finding[];
}
