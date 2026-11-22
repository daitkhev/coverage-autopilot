/** The levels the service writes a line at when something went wrong. */
const ALARMING = new Set(['warn', 'error']);

function faultOf(line: string): string | null {
  let level: unknown;
  try {
    level = (JSON.parse(line) as { readonly level?: unknown }).level;
  } catch {
    return `A line of the log is not JSON: ${line}`;
  }
  return typeof level === 'string' && ALARMING.has(level) ? line : null;
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
 * not make.
 */
export function logFaults(log: string): string[] {
  return log
    .split('\n')
    .filter((line) => line !== '')
    .flatMap((line) => {
      const fault = faultOf(line);
      return fault === null ? [] : [fault];
    });
}
