import { FilePath } from '#kernel/primitives/file-path';
import { addedFilesOf } from '#verification/domain/services/patch-text.service';

const SEPARATOR = '/';
const PARENT = '..';

/** Parts that would let two texts name one file: none, here, or a backslash. */
const NOT_PLAIN = /(?:^|\/)\.?(?:\/|$)|[\\\0]/u;

export interface PatchText {
  readonly text: string;
  /** How the name of a test file ends, such as `.test.ts`. */
  readonly suffixes: readonly string[];
}

export type TestFiles =
  | { readonly outcome: 'test_files'; readonly files: readonly FilePath[] }
  | { readonly outcome: 'refused'; readonly reason: string };

export interface AppliedFiles {
  /** The files git says it wrote. */
  readonly applied: readonly FilePath[];
  /** The files the text of the patch adds. */
  readonly added: readonly FilePath[];
}

function pathProblemOf(
  path: string,
  suffixes: readonly string[],
): string | null {
  if (path.startsWith(SEPARATOR)) {
    return `The patch adds ${path}, an absolute path.`;
  }
  if (path.split(SEPARATOR).includes(PARENT)) {
    return `The patch adds ${path}, which leads out of the repository.`;
  }
  if (NOT_PLAIN.test(path)) {
    return `The patch adds ${path}, which is not a plain path in the repository.`;
  }
  return suffixes.some((suffix) => path.endsWith(suffix))
    ? null
    : `The patch adds ${path}, whose name does not end like a test file: ${suffixes.join(' or ')}.`;
}

function problemOf(
  paths: readonly string[],
  suffixes: readonly string[],
): string | null {
  const twice = paths.find((path, at) => paths.indexOf(path) !== at);
  if (twice !== undefined) {
    return `The patch adds ${twice} twice.`;
  }
  const problems = paths.map((path) => pathProblemOf(path, suffixes));
  return problems.find((problem) => problem !== null) ?? null;
}

/**
 * The first check of the gate, on the text of the patch before it is
 * applied: every file must be new, plain, of text and named like a test,
 * so the tests of the commit stay as they were and a patch cannot pass by
 * weakening one of them.
 */
export function testFilesOf(patch: PatchText): TestFiles {
  const added = addedFilesOf(patch.text);
  if (added.outcome === 'refused') {
    return added;
  }
  const problem = problemOf(added.paths, patch.suffixes);
  return problem === null
    ? {
        outcome: 'test_files',
        files: added.paths.map((path) => FilePath.create(path)),
      }
    : { outcome: 'refused', reason: problem };
}

/**
 * The same check on the files git wrote: they must be exactly the files the
 * text adds. A difference means git read the text in another way than the
 * gate did, so the gate cannot tell what the patch changed.
 */
export function appliedFilesProblemOf(files: AppliedFiles): string | null {
  const added = new Set(files.added.map(({ value }) => value));
  const applied = new Set(files.applied.map(({ value }) => value));
  const extra = [...applied].find((path) => !added.has(path));
  if (extra !== undefined) {
    return `git wrote ${extra}, which the text of the patch does not add as a test file.`;
  }
  const missing = [...added].find((path) => !applied.has(path));
  return missing === undefined
    ? null
    : `git did not write ${missing}, which the text of the patch adds.`;
}
