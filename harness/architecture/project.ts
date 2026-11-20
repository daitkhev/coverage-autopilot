import type { Finding } from '#harness/architecture/finding';

export type ImportKind = 'relative' | 'builtin' | 'package' | 'alias';

export interface ImportRecord {
  readonly specifier: string;
  readonly line: number;
  /** True for `import type` and `export type`: nothing is loaded at run. */
  readonly typeOnly: boolean;
  readonly kind: ImportKind;
  /** The file an alias leads to, when that file exists. */
  readonly target: string | undefined;
}

export interface SourceFile {
  readonly path: string;
  readonly imports: readonly ImportRecord[];
}

export interface Project {
  readonly files: readonly SourceFile[];
}

export interface Rule {
  readonly id: string;
  readonly check: (project: Project) => readonly Finding[];
}
