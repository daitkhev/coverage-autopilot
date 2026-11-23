import { stripVTControlCharacters } from 'node:util';

import type { TestFailure } from '#coverage/application/ports/test-report-reader.port';
import {
  failuresOf,
  plainLine,
  plainName,
  type ReportedFailure,
  testFileOf,
} from '#coverage/infrastructure/reports/reported-failures';
import type { TestReport } from '#coverage/infrastructure/reports/test-report.schema';

/** Enough to say why a test failed, and little for a prompt to carry. */
const MOST_LINES = 4;
const MOST_CHARACTERS = 200;

const LINE_BREAK = /\r?\n/u;

/** The last space, and the part of a word after it, at the end of a text. */
const LAST_WORD = /\s\S*$/u;

/** A frame of an installed package or of Node says nothing of the test. */
const FOREIGN_FRAME = /^at .*(?:node_modules\/|node:internal)/u;

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
  const name = plainName(test, roots);
  return name === null ? null : wholeWords(name);
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
