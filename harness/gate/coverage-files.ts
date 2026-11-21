import { posix } from 'node:path';

import ts from 'typescript';

import type { Area } from '#harness/gate/areas';
import type { Structure } from '#harness/shared/structure';

/** The folders under the source of an area that coverage does not count. */
export function leftOutOf(area: Area, structure: Structure): string[] {
  return [...area.leftOut, ...structure.excluded].filter((prefix) =>
    prefix.startsWith(area.source),
  );
}

/** The source files that must be in the coverage report of an area. */
export function measuredFiles(
  files: readonly string[],
  area: Area,
  structure: Structure,
): string[] {
  const leftOut = leftOutOf(area, structure);
  return files.filter(
    (path) =>
      path.startsWith(area.source) &&
      !leftOut.some((prefix) => path.startsWith(prefix)) &&
      structure.extensions.includes(posix.extname(path)),
  );
}

function isTypeOnly(statement: ts.Statement): boolean {
  if (ts.isImportDeclaration(statement)) {
    const phase = statement.importClause?.phaseModifier;
    return phase === ts.SyntaxKind.TypeKeyword;
  }
  if (ts.isExportDeclaration(statement)) {
    return statement.isTypeOnly;
  }
  return (
    ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
  );
}

/**
 * Whether a file has anything that runs. A file of types alone becomes an
 * empty module, and a coverage report has nothing to say about it.
 */
export function hasRuntimeCode(path: string, text: string): boolean {
  const target = ts.ScriptTarget.Latest;
  const source = ts.createSourceFile(path, text, target, true);
  return source.statements.some((statement) => !isTypeOnly(statement));
}
