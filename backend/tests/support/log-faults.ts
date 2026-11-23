import { unexplainedLines } from '#tests/support/job-lines';

/** The line a program writes once it ended, at debug. */
const PROGRAM_ENDED = 'A program ended.';

/** The programs shown beside the faults, enough to find the one that failed. */
const SHOWN_PROGRAMS = 40;

/**
 * A job given up once stops spent all its runs is explained by them. The
 * storm stops its service only once it is idle, so no stop spends a run,
 * and a job given up is a fault whatever its runs.
 */
const NO_STOP_SPENDS_RUNS = Number.POSITIVE_INFINITY;

/**
 * A program that did not end with 0. Many do so by design, such as a
 * look for a commit the mirror lacks, so this is no fault on its own.
 */
function failedProgram(line: string): boolean {
  try {
    const read = JSON.parse(line) as {
      readonly message?: unknown;
      readonly fields?: { readonly exitCode?: unknown };
    };
    return read.message === PROGRAM_ENDED && read.fields?.exitCode !== 0;
  } catch {
    return false;
  }
}

/**
 * The lines of a log that name a defect. Under the stand-ins of the tests
 * no line at warn or error is expected, whatever the order of requests:
 *
 * - "A request ended in a fault." is a 500.
 * - "The handler of a job failed." is an error nobody foresaw: a cancel
 *   or a lost lease stops a job without it.
 * - "A job was put back in the queue." is a fault that may pass, and no
 *   stand-in fails, so only the service itself could have caused it. The
 *   one a stop explains cannot come: the service stops once it is idle.
 * - "A job was given up", "The end of a job could not be written.", "No
 *   job could be claimed." and a payload that cannot be read are writes
 *   or reads the database refused.
 * - "A working copy could not be removed" is a folder left on the disk.
 * - The lines of the start about images and leftovers name an engine the
 *   stand-in always answers, and a folder that is new.
 *
 * So every line at warn or error is a finding, as is a job stopped for
 * another reason than a cancel and a line that is not JSON, which the
 * logger did not write. A fault of a job names only its code, so the
 * programs that failed come after the faults, to tell which one it was.
 */
export function logFaults(log: string): string[] {
  const faults = unexplainedLines(log, NO_STOP_SPENDS_RUNS).map((line) =>
    typeof line === 'string'
      ? `A line of the log is not JSON: ${line}`
      : JSON.stringify(line),
  );
  if (faults.length === 0) {
    return [];
  }
  const programs = log
    .split('\n')
    .filter(failedProgram)
    .slice(0, SHOWN_PROGRAMS);
  return [...faults, ...programs.map((line) => `Beside them: ${line}`)];
}
