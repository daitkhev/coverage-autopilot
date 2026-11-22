/** The levels the service writes a line at when something went wrong. */
const ALARMING = new Set(['warn', 'error']);

/** The line a program writes once it ended, at debug. */
const PROGRAM_ENDED = 'A program ended.';

/** The programs shown beside the faults, enough to find the one that failed. */
const SHOWN_PROGRAMS = 40;

interface LogLine {
  readonly level?: unknown;
  readonly message?: unknown;
  readonly fields?: { readonly exitCode?: unknown };
}

function parsed(line: string): LogLine | null {
  try {
    return JSON.parse(line) as LogLine;
  } catch {
    return null;
  }
}

function faultOf(line: string): string | null {
  const read = parsed(line);
  if (read === null) {
    return `A line of the log is not JSON: ${line}`;
  }
  return typeof read.level === 'string' && ALARMING.has(read.level)
    ? line
    : null;
}

/**
 * A program that did not end with 0. Many do so by design, such as a
 * look for a commit the mirror lacks, so this is no fault on its own.
 */
function failedProgram(line: string): boolean {
  const read = parsed(line);
  return read?.message === PROGRAM_ENDED && read.fields?.exitCode !== 0;
}

/**
 * The lines of a log that name a defect. Under the stand-ins of the tests
 * no line at warn or error is expected, whatever the order of requests:
 *
 * - "A request ended in a fault." is a 500.
 * - "The handler of a job failed." is an error nobody foresaw: a cancel
 *   or a lost lease stops a job without it.
 * - "A job was put back in the queue." is a fault that may pass, and no
 *   stand-in fails, so only the service itself could have caused it.
 * - "A job was given up", "The end of a job could not be written.", "No
 *   job could be claimed." and a payload that cannot be read are writes
 *   or reads the database refused.
 * - "A working copy could not be removed" is a folder left on the disk.
 * - The lines of the start about images and leftovers name an engine the
 *   stand-in always answers, and a folder that is new.
 *
 * So every line at warn or error is a finding, and so is a line that is
 * not JSON, which would be a write to the standard error the logger did
 * not make. A fault of a job names only its code, so the programs that
 * failed come after the faults, to tell which one it was.
 */
export function logFaults(log: string): string[] {
  const lines = log.split('\n').filter((line) => line !== '');
  const faults = lines.flatMap((line) => {
    const fault = faultOf(line);
    return fault === null ? [] : [fault];
  });
  if (faults.length === 0) {
    return [];
  }
  const programs = lines.filter(failedProgram).slice(0, SHOWN_PROGRAMS);
  return [...faults, ...programs.map((line) => `Beside them: ${line}`)];
}
