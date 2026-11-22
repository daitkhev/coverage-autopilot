import { stripVTControlCharacters } from 'node:util';

import type { TestFailure } from '#coverage/application/ports/test-report-reader.port';
import { insideOf } from '#coverage/infrastructure/reports/copy-paths';
import type {
  TestFileResult,
  TestReport,
} from '#coverage/infrastructure/reports/test-report.schema';
import { FilePath } from '#kernel/primitives/file-path';

/** Enough to say why a test failed, and little for a prompt to carry. */
const MOST_LINES = 4;
const MOST_CHARACTERS = 200;

const FAILED = 'failed';

/** What stands for the root of the working copy in a line that is kept. */
const ROOT = '.';

const LINE_BREAK = /\r?\n/u;

/** Control and invisible format characters, which a terminal may obey. */
const UNPRINTABLE = /[\p{Cc}\p{Cf}]/gu;

const SPACES = /\s+/gu;

/** The last space, and the part of a word after it, at the end of a text. */
const LAST_WORD = /\s\S*$/u;

/** A frame of an installed package or of Node says nothing of the test. */
const FOREIGN_FRAME = /^at .*(?:node_modules\/|node:internal)/u;

/** A failure in the words of the report, before anything of it is cleaned. */
interface ReportedFailure {
  readonly file: string;
  readonly test: string | null;
  readonly message: string;
}

function failedToRun(file: TestFileResult): ReportedFailure[] {
  const testFailed = file.assertionResults.some(
    (test) => test.status === FAILED,
  );
  return testFailed
    ? []
    : [{ file: file.name, test: null, message: file.message }];
}

function failedTests(file: TestFileResult): ReportedFailure[] {
  return file.assertionResults
    .filter((test) => test.status === FAILED)
    .map((test) => ({
      file: file.name,
      test: test.fullName,
      message: test.failureMessages[0] ?? '',
    }));
}

/**
 * Every failure of a report in the order to tell them: first the files
 * that failed to run, since none of their tests ran, then the tests that
 * failed.
 */
function failuresOf(report: TestReport): ReportedFailure[] {
  const failed = report.testResults.filter((file) => file.status === FAILED);
  return [...failed.flatMap(failedToRun), ...failed.flatMap(failedTests)];
}

/** One line of plain characters, with `.` for the root of the copy. */
export function plainLine(line: string, roots: readonly string[]): string {
  return roots
    .reduce((kept, root) => kept.replaceAll(root, ROOT), line)
    .replace(UNPRINTABLE, ' ')
    .replace(SPACES, ' ')
    .trim();
}

/**
 * At most `MOST_CHARACTERS`, cut after a whole word, so that a word the
 * service hides later, such as a credential, is never kept in part. A
 * text with no space before the cut keeps nothing.
 */
function wholeWords(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= MOST_CHARACTERS) {
    return text;
  }
  const kept = characters.slice(0, MOST_CHARACTERS + 1).join('');
  const end = kept.search(LAST_WORD);
  return end === -1 ? '' : `${kept.slice(0, end)}…`;
}

function linesOf(message: string, roots: readonly string[]): string[] {
  return stripVTControlCharacters(message)
    .split(LINE_BREAK)
    .map((line) => plainLine(line, roots))
    .filter((line) => !FOREIGN_FRAME.test(line))
    .map(wholeWords)
    .filter((line) => line !== '')
    .slice(0, MOST_LINES);
}

function testNameOf(
  test: string | null,
  roots: readonly string[],
): string | null {
  return test === null
    ? null
    : wholeWords(plainLine(stripVTControlCharacters(test), roots));
}

/** A path of git, or `null` for a file outside the copy or of no such name. */
function testFileOf(path: string, roots: readonly string[]): FilePath | null {
  const inside = insideOf(roots, path);
  try {
    return inside === null ? null : FilePath.create(inside);
  } catch {
    return null;
  }
}

/** A failure as it may leave the reader, or `null` when nothing of it is left. */
function excerptOf(
  failure: ReportedFailure,
  roots: readonly string[],
): TestFailure | null {
  const file = testFileOf(failure.file, roots);
  const test = testNameOf(failure.test, roots);
  const lines = linesOf(failure.message, roots);
  return file === null || test === '' || lines.length === 0
    ? null
    : { file, test, lines };
}

/**
 * The first failure of a report that still says something once it is
 * cleaned and cut: the paths of the copy relative to it, no codes of a
 * terminal, no frames of other code, a few short lines.
 */
export function firstFailureOf(
  report: TestReport,
  roots: readonly string[],
): TestFailure | null {
  for (const failure of failuresOf(report)) {
    const excerpt = excerptOf(failure, roots);
    if (excerpt !== null) {
      return excerpt;
    }
  }
  return null;
}
