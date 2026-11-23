import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import ts from 'typescript';

import type { SourceClassifier } from '#coverage/application/ports/source-classifier.port';
import type { SourceReading } from '#coverage/domain/services/file-state.service';
import { UnreadableSourceFileError } from '#coverage/infrastructure/errors/unreadable-source-file.error';
import { readCopyFile, REFUSAL_WORDS } from '#infrastructure/files/copy-file';
import type { FilePath } from '#kernel/primitives/file-path';

const JSX_EXTENSION = '.tsx';

/** Lines of a file count from one for a person, and from zero for the parser. */
const FIRST_LINE = 1;

/**
 * A statement that leaves nothing in the code that runs: an interface, a
 * type alias, an import or an export of types alone, the empty export
 * that only marks a module, or anything declared with `declare`.
 */
function isDeclarationOnly(statement: ts.Statement): boolean {
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    return true;
  }
  if (ts.isImportDeclaration(statement)) {
    return statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
  }
  if (ts.isExportDeclaration(statement)) {
    return statement.isTypeOnly || isEmptyExport(statement);
  }
  return isDeclared(statement);
}

function isEmptyExport(statement: ts.ExportDeclaration): boolean {
  const clause = statement.exportClause;
  return (
    statement.moduleSpecifier === undefined &&
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.length === 0
  );
}

function isDeclared(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement)
    ? ts.getModifiers(statement)
    : undefined;
  return (
    modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
    ) === true
  );
}

/** The first thing the parser refused, with the line it is on. */
function messageOf(diagnostic: ts.Diagnostic): string {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  if (diagnostic.file === undefined || diagnostic.start === undefined) {
    return text;
  }
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start,
  );
  return `Line ${String(line + FIRST_LINE)}: ${text}`;
}

/**
 * A link is refused: code of the repository may have put one in the place
 * of a source, and it could lead to a file of the host.
 */
function readSource(root: string, path: string): string {
  const file = readCopyFile(root, path);
  if (file.outcome === 'read') {
    return file.text;
  }
  throw new UnreadableSourceFileError(
    file.outcome === 'missing'
      ? `The source file ${path} could not be read.`
      : `The source file ${path} was not read: ${REFUSAL_WORDS[file.reason]}.`,
  );
}

/** Turning one file into JavaScript reports what the parser refused. */
function firstSyntaxError(
  fileName: string,
  text: string,
): ts.Diagnostic | undefined {
  const { diagnostics } = ts.transpileModule(text, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      jsx: ts.JsxEmit.Preserve,
    },
  });
  return diagnostics?.[0];
}

function readingOf(root: string, name: string): SourceReading {
  const text = readSource(root, join(root, name));
  const refused = firstSyntaxError(name, text);
  if (refused !== undefined) {
    return { kind: 'parse_failed', message: messageOf(refused) };
  }
  const file = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    false,
    name.endsWith(JSX_EXTENSION) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return file.statements.every(isDeclarationOnly)
    ? { kind: 'declarations_only' }
    : { kind: 'executable' };
}

/**
 * Reads a source file with the parser of the TypeScript compiler. Nothing
 * is type-checked and nothing of the repository is run: the file is text
 * to it, and so are its imports.
 */
@Injectable()
export class TypescriptSourceClassifier implements SourceClassifier {
  public async classify(request: {
    readonly workingCopyPath: string;
    readonly path: FilePath;
  }): Promise<SourceReading> {
    return Promise.resolve(
      readingOf(request.workingCopyPath, request.path.value),
    );
  }
}
