import { posix } from 'node:path';

import ts from 'typescript';

import type { Structure } from '#harness/shared/structure';

/** What coverage is measured on, and what is left out of it. */
const MEASURED = 'harness/';
const TESTS = 'harness/tests/';

/** The source files that must be in the coverage report of the harness. */
export function measuredFiles(
  files: readonly string[],
  structure: Structure,
): string[] {
  return files.filter(
    (path) =>
      path.startsWith(MEASURED) &&
      !path.startsWith(TESTS) &&
      !structure.excluded.some((prefix) => path.startsWith(prefix)) &&
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
