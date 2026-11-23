/** A value a line can carry as it is, with no object inside. */
type LogValue = string | number | boolean | null;

/** Named values of a line, such as the id of a job. */
export type LogFields = Readonly<Record<string, LogValue>>;

/**
 * Writes what the service does, one line for each event, for a person who
 * reads it later. A line never carries a token: every secret value the
 * logger was told about is replaced before the line is written.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** A logger that adds these fields to every line it writes. */
  child(fields: LogFields): Logger;
  /**
   * A secret read after the start, such as a credential read at the
   * moment of use. From now on every logger of the same root replaces it.
   */
  conceal(secret: string): void;
}

/** The injection token of the logger. */
export const LOGGER = Symbol('Logger');
