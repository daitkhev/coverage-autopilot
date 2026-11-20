import ts from 'typescript';

export interface ParsedImport {
  readonly specifier: string;
  readonly line: number;
  readonly typeOnly: boolean;
  readonly names: readonly string[];
}

interface Found {
  readonly literal: ts.Node | undefined;
  readonly typeOnly: boolean;
  readonly names: readonly string[];
}

const ALL = '*';

function elementNames(
  elements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[],
): string[] {
  return elements.map((element) => (element.propertyName ?? element.name).text);
}

function importedNames(clause: ts.ImportClause | undefined): string[] {
  const bindings = clause?.namedBindings;
  const names = clause?.name === undefined ? [] : ['default'];
  if (bindings === undefined) {
    return names;
  }
  return ts.isNamespaceImport(bindings)
    ? [...names, ALL]
    : [...names, ...elementNames(bindings.elements)];
}

function exportedNames(clause: ts.NamedExportBindings | undefined): string[] {
  return clause !== undefined && ts.isNamedExports(clause)
    ? elementNames(clause.elements)
    : [ALL];
}

function fromDeclaration(node: ts.Node): Found | undefined {
  if (ts.isImportDeclaration(node)) {
    const phase = node.importClause?.phaseModifier;
    return {
      literal: node.moduleSpecifier,
      typeOnly: phase === ts.SyntaxKind.TypeKeyword,
      names: importedNames(node.importClause),
    };
  }
  if (ts.isExportDeclaration(node)) {
    return {
      literal: node.moduleSpecifier,
      typeOnly: node.isTypeOnly,
      names: exportedNames(node.exportClause),
    };
  }
  return undefined;
}

function fromExpression(node: ts.Node): Found | undefined {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    return { literal: node.arguments[0], typeOnly: false, names: [ALL] };
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return { literal: node.argument.literal, typeOnly: true, names: [ALL] };
  }
  return undefined;
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  const position = node.getStart(source);
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

/**
 * Every import of a file, read from its text alone. No type checker runs, so
 * a file that does not compile is still read.
 */
export function parseImports(path: string, text: string): ParsedImport[] {
  const target = ts.ScriptTarget.Latest;
  const source = ts.createSourceFile(path, text, target, true);
  const imports: ParsedImport[] = [];
  const visit = (node: ts.Node): void => {
    const found = fromDeclaration(node) ?? fromExpression(node);
    const literal = found?.literal;
    if (found !== undefined && literal !== undefined) {
      if (ts.isStringLiteralLike(literal)) {
        imports.push({
          specifier: literal.text,
          line: lineOf(source, node),
          typeOnly: found.typeOnly,
          names: found.names,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}
