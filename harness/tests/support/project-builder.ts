import type {
  ImportKind,
  ImportRecord,
  Project,
  SourceFile,
} from '#harness/architecture/project';

interface ImportShape {
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly line?: number;
  readonly target?: string;
  readonly typeOnly?: boolean;
}

export function importOf(shape: ImportShape): ImportRecord {
  return {
    specifier: shape.specifier,
    kind: shape.kind,
    line: shape.line ?? 1,
    target: shape.target,
    typeOnly: shape.typeOnly ?? false,
  };
}

/** An alias import that leads to an existing file. */
export function importTo(target: string, line = 1): ImportRecord {
  return importOf({ specifier: `#${target}`, kind: 'alias', line, target });
}

export function sourceFile(
  path: string,
  imports: readonly ImportRecord[] = [],
): SourceFile {
  return { path, imports };
}

export function projectOf(...files: readonly SourceFile[]): Project {
  return { files };
}
