import ts from 'typescript';

export interface ParsedImport {
  readonly specifier: string;
  readonly line: number;
  readonly typeOnly: boolean;
}

interface Found {
  readonly literal: ts.Expression | ts.Node | undefined;
  readonly typeOnly: boolean;
}

function fromDeclaration(node: ts.Node): Found | undefined {
  if (ts.isImportDeclaration(node)) {
    const phase = node.importClause?.phaseModifier;
    const typeOnly = phase === ts.SyntaxKind.TypeKeyword;
    return { literal: node.moduleSpecifier, typeOnly };
  }
  if (ts.isExportDeclaration(node)) {
    return { literal: node.moduleSpecifier, typeOnly: node.isTypeOnly };
  }
  return undefined;
}

function fromExpression(node: ts.Node): Found | undefined {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    return { literal: node.arguments[0], typeOnly: false };
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return { literal: node.argument.literal, typeOnly: true };
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
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}
