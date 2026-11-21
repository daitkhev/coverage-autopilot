import type { LogFields, Logger } from '#ports/logger.port';

/** One line a test can look at. */
export interface RecordedLine {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly fields: LogFields;
}

/**
 * A logger that writes nowhere and keeps every line, with the fields of
 * the logger it was written through. A child shares the list of its root.
 */
export class RecordingLogger implements Logger {
  public readonly lines: RecordedLine[];
  private readonly fields: LogFields;

  public constructor(lines: RecordedLine[] = [], fields: LogFields = {}) {
    this.lines = lines;
    this.fields = fields;
  }

  public debug(message: string, fields: LogFields = {}): void {
    this.keep('debug', message, fields);
  }

  public info(message: string, fields: LogFields = {}): void {
    this.keep('info', message, fields);
  }

  public warn(message: string, fields: LogFields = {}): void {
    this.keep('warn', message, fields);
  }

  public error(message: string, fields: LogFields = {}): void {
    this.keep('error', message, fields);
  }

  public child(fields: LogFields): Logger {
    return new RecordingLogger(this.lines, { ...this.fields, ...fields });
  }

  public conceal(): void {
    // Nothing is written, so there is nothing to hide.
  }

  /** The lines of one level, in the order they were written. */
  public at(level: RecordedLine['level']): RecordedLine[] {
    return this.lines.filter((line) => line.level === level);
  }

  private keep(
    level: RecordedLine['level'],
    message: string,
    fields: LogFields,
  ): void {
    this.lines.push({ level, message, fields: { ...this.fields, ...fields } });
  }
}
