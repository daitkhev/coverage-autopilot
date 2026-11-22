/** The fields of one line of the log, as the service writes them. */
type LineFields = Readonly<Record<string, unknown>>;

/** One line of the log, as JSON. */
interface LogLine {
  readonly level: string;
  readonly message: string;
  readonly fields: LineFields;
}

/** What a line says of a journey: its step and how it or its job ended. */
const TOLD = ['step', 'outcome', 'result', 'reason'] as const;

/**
 * The lines at info of a log whose fields `belongs` picks, in order, each
 * as its message followed by its step and how it ended, so a test reads a
 * journey as a person reading the log would.
 */
export function journeyIn(
  log: string,
  belongs: (fields: LineFields) => boolean,
): string[] {
  return log
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LogLine)
    .filter((line) => line.level === 'info' && belongs(line.fields))
    .map((line) =>
      [line.message]
        .concat(TOLD.map((field) => line.fields[field]).map(String))
        .filter((part) => part !== 'undefined')
        .join(' '),
    );
}
