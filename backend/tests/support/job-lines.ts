/** One line of the log, as the logger of the service writes it. */
interface LogLine {
  readonly level: string;
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

const TAKEN = 'A job was taken.';
const ENDED = 'A job ended.';
const PUT_BACK = 'A job was put back in the queue.';
const GIVEN_UP = 'A job was given up: it will not run again.';

/** A job that ends this way does not run again. */
const LAST_ENDS: ReadonlySet<unknown> = new Set(['completed', 'given_up']);

/** The levels of a line that tells of something that went wrong. */
const WRONG: ReadonlySet<string> = new Set(['warn', 'error']);

/**
 * Every whole line of a log, as JSON, and the text of a line that is not
 * JSON, such as the one line of a start that failed. A process that was
 * killed may have written a part of its last line, which is no line.
 */
function linesOf(log: string): (LogLine | string)[] {
  return log
    .split('\n')
    .slice(0, -1)
    .map((line) => {
      try {
        return JSON.parse(line) as LogLine;
      } catch {
        return line;
      }
    });
}

function linesSaying(log: string, message: string): LogLine[] {
  return linesOf(log).filter(
    (line): line is LogLine =>
      typeof line !== 'string' && line.message === message,
  );
}

/** The job each line names, as often as lines name it. */
function jobIdsOf(lines: readonly LogLine[]): string[] {
  return lines.map((line) => String(line.fields['jobId']));
}

/**
 * A stop explains two warnings and errors: a job put back in the queue
 * because the service was told to end, and a job given up once the stops
 * spent all its runs, which only a stop that cut a run short does here.
 */
function isExplained(line: LogLine, maxRuns: number): boolean {
  switch (line.message) {
    case PUT_BACK:
      return line.fields['reason'] === 'worker_shutdown';
    case GIVEN_UP:
      return line.fields['attempt'] === maxRuns;
    default:
      return false;
  }
}

/**
 * A job the worker stopped and saved nothing of. Only a cancel explains
 * it here: one start runs at a time, so no other worker takes a lease,
 * and no improvement runs long enough to meet its deadline.
 */
function isLeftUnsaved(line: LogLine): boolean {
  return (
    line.message === ENDED &&
    line.fields['outcome'] === 'stopped' &&
    line.fields['reason'] !== 'user_cancelled'
  );
}

/**
 * The lines of a log that tell of a fault no stop explains: every other
 * warning and error, a job stopped for another reason than a cancel, and
 * every line that is not JSON.
 */
export function unexplainedLines(
  log: string,
  maxRuns: number,
): (LogLine | string)[] {
  return linesOf(log).filter(
    (line) =>
      typeof line === 'string' ||
      isLeftUnsaved(line) ||
      (WRONG.has(line.level) && !isExplained(line, maxRuns)),
  );
}

/** The jobs that ended for good more than once, in the logs of all starts. */
export function jobsEndedTwice(logs: readonly string[]): string[] {
  const ids = jobIdsOf(
    logs
      .flatMap((log) => linesSaying(log, ENDED))
      .filter((line) => LAST_ENDS.has(line.fields['outcome'])),
  );
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

/** The jobs a start took and did not end, once for each take. */
export function jobsLeftRunning(log: string): string[] {
  const ended = jobIdsOf(linesSaying(log, ENDED));
  return jobIdsOf(linesSaying(log, TAKEN)).filter((id) => {
    const index = ended.indexOf(id);
    if (index === -1) {
      return true;
    }
    ended.splice(index, 1);
    return false;
  });
}
