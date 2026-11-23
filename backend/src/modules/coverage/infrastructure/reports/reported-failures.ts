import { stripVTControlCharacters } from 'node:util';

import { insideOf } from '#coverage/infrastructure/reports/copy-paths';
import type {
  TestFileResult,
  TestReport,
} from '#coverage/infrastructure/reports/test-report.schema';
import { FilePath } from '#kernel/primitives/file-path';

/** The status of a file or a test of a report that failed. */
export const FAILED = 'failed';

/** What stands for the root of the working copy in a line that is kept. */
const ROOT = '.';

/** Control and invisible format characters, which a terminal may obey. */
const UNPRINTABLE = /[\p{Cc}\p{Cf}]/gu;

const SPACES = /\s+/gu;

/** A failure in the words of the report, before anything of it is cleaned. */
export interface ReportedFailure {
  readonly file: string;
  /** The full name of the test, `null` when the file failed to run. */
  readonly test: string | null;
  readonly message: string;
}

/**
 * A file that failed with no test failed is a file that failed to run,
 * since none of its tests ran.
 */
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
 * failed. Jest and Vitest write the report in one shape, so a failure is
 * found the same way for both.
 */
export function failuresOf(report: TestReport): ReportedFailure[] {
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
 * The name of a test as two runs in two copies of one commit both give
 * it: without the codes of a terminal, with `.` for the root of the copy,
 * and on one line.
 */
export function plainName(
  name: string | null,
  roots: readonly string[],
): string | null {
  return name === null
    ? null
    : plainLine(stripVTControlCharacters(name), roots);
}

/** A path of git, or `null` for a file outside the copy or of no such name. */
export function testFileOf(
  path: string,
  roots: readonly string[],
): FilePath | null {
  const inside = insideOf(roots, path);
  try {
    return inside === null ? null : FilePath.create(inside);
  } catch {
    return null;
  }
}
