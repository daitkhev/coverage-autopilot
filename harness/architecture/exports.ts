import ts from 'typescript';

function isExported(statement: ts.Statement): boolean {
  if (!ts.canHaveModifiers(statement)) {
    return false;
  }
  const modifiers = ts.getModifiers(statement) ?? [];
  return modifiers.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function declaredNames(statement: ts.Statement): string[] {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
    );
  }
  const named =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement);
  return named && statement.name !== undefined ? [statement.name.text] : [];
}

function listedNames(statement: ts.Statement): string[] {
  if (!ts.isExportDeclaration(statement)) {
    return [];
  }
  const clause = statement.exportClause;
  if (clause === undefined) {
    return ['*'];
  }
  return ts.isNamedExports(clause)
    ? clause.elements.map((element) => element.name.text)
    : [clause.name.text];
}

/** The names a file exports, sorted: its public surface as text shows it. */
export function parseExports(path: string, text: string): string[] {
  const target = ts.ScriptTarget.Latest;
  const source = ts.createSourceFile(path, text, target, true);
  const names = source.statements.flatMap((statement) => [
    ...(isExported(statement) ? declaredNames(statement) : []),
    ...listedNames(statement),
  ]);
  return [...new Set(names)].sort();
}
