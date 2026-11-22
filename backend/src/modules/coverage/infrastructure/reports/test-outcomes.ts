import { stripVTControlCharacters } from 'node:util';

import type {
  FailingTest,
  TestOutcomes,
} from '#coverage/application/ports/test-report-reader.port';
import { insideOf } from '#coverage/infrastructure/reports/copy-paths';
import { plainLine } from '#coverage/infrastructure/reports/test-failure-excerpt';
import type {
  TestFileResult,
  TestReport,
} from '#coverage/infrastructure/reports/test-report.schema';
import { FilePath } from '#kernel/primitives/file-path';

const PASSED = 'passed';
const FAILED = 'failed';

/** What one file of a report holds, in the words of the report. */
interface FileOutcomes {
  readonly ran: number;
  /** The full names of its tests that failed, `null` for the whole file. */
  readonly failing: readonly (string | null)[];
}

/** A test that was skipped, left out or only planned did not run. */
function hasRun(status: string): boolean {
  return status === PASSED || status === FAILED;
}

/**
 * A file that failed with no test failed is a file that failed to run,
 * since none of its tests ran: it counts as one test that failed.
 */
function outcomesOfFile(file: TestFileResult): FileOutcomes {
  const ran = file.assertionResults.filter(({ status }) => hasRun(status));
  const failing = file.assertionResults
    .filter(({ status }) => status === FAILED)
    .map(({ fullName }) => fullName);
  return file.status === FAILED && failing.length === 0
    ? { ran: ran.length + 1, failing: [null] }
    : { ran: ran.length, failing };
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

/**
 * A name as two runs in two copies both give it: without the codes of a
 * terminal, with `.` for the root of the copy, and on one line.
 */
function plainName(
  name: string | null,
  roots: readonly string[],
): string | null {
  return name === null
    ? null
    : plainLine(stripVTControlCharacters(name), roots);
}

function keyOf(test: FailingTest): string {
  return JSON.stringify([test.file.value, test.test]);
}

/** The failing tests of one file, or `null` when it is no file of the copy. */
function failingOfFile(
  result: TestFileResult,
  roots: readonly string[],
): FailingTest[] | null {
  const names = outcomesOfFile(result).failing;
  if (names.length === 0) {
    return [];
  }
  const file = testFileOf(result.name, roots);
  return file === null
    ? null
    : names.map((name) => ({ file, test: plainName(name, roots) }));
}

/**
 * The failing tests of every file, each once, or `null` when one of them
 * is in no file of the copy and so cannot be named.
 */
function failingOf(
  report: TestReport,
  roots: readonly string[],
): FailingTest[] | null {
  const failing = new Map<string, FailingTest>();
  for (const result of report.testResults) {
    const tests = failingOfFile(result, roots);
    if (tests === null) {
      return null;
    }
    for (const test of tests) {
      failing.set(keyOf(test), test);
    }
  }
  return [...failing.values()];
}

/**
 * Which tests of a report ran and which of them failed, each named the
 * way the run of another copy of the same commit names it, so that two
 * runs can be compared test by test.
 */
export function testOutcomesOf(
  report: TestReport,
  roots: readonly string[],
): TestOutcomes | null {
  const failing = failingOf(report, roots);
  const ran = report.testResults
    .map((result) => outcomesOfFile(result).ran)
    .reduce((sum, each) => sum + each, 0);
  return failing === null ? null : { ran, failing };
}
