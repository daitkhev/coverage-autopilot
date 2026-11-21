import type { JsonLogLines } from '#infrastructure/logging/json-log-lines';
import type { LogLevel } from '#infrastructure/logging/log-settings';
import type { LogFields, Logger } from '#ports/logger.port';

/**
 * A logger that adds its fields to every line. A field of a line wins over
 * a field of the logger with the same name, and a child's over its
 * parent's, so the most specific value is the one written.
 */
export class FieldLogger implements Logger {
  private readonly lines: JsonLogLines;
  private readonly fields: LogFields;

  public constructor(lines: JsonLogLines, fields: LogFields) {
    this.lines = lines;
    this.fields = fields;
  }

  public debug(message: string, fields: LogFields = {}): void {
    this.write('debug', message, fields);
  }

  public info(message: string, fields: LogFields = {}): void {
    this.write('info', message, fields);
  }

  public warn(message: string, fields: LogFields = {}): void {
    this.write('warn', message, fields);
  }

  public error(message: string, fields: LogFields = {}): void {
    this.write('error', message, fields);
  }

  public child(fields: LogFields): Logger {
    return new FieldLogger(this.lines, { ...this.fields, ...fields });
  }

  public conceal(secret: string): void {
    this.lines.conceal(secret);
  }

  private write(level: LogLevel, message: string, fields: LogFields): void {
    this.lines.write(level, message, { ...this.fields, ...fields });
  }
}
