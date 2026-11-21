import {
  LOG_LEVELS,
  type LogLevel,
  type LogSettings,
} from '#infrastructure/logging/log-settings';
import type { Clock } from '#kernel/time/clock';
import type { LogFields } from '#ports/logger.port';

const REDACTED = '[redacted]';

function rankOf(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

/**
 * What every logger of one root shares: the stream, the clock, the least
 * level and the secrets. A secret is replaced before the line is turned
 * into JSON, so its escaped spelling cannot slip through either.
 */
export class JsonLogLines {
  private readonly clock: Clock;
  private readonly settings: LogSettings;
  /** The longest first, so a secret inside another is never left half. */
  private secrets: readonly string[] = [];

  public constructor(clock: Clock, settings: LogSettings) {
    this.clock = clock;
    this.settings = settings;
    for (const secret of settings.secrets) {
      this.conceal(secret);
    }
  }

  /** An empty value would match everywhere, so it is no secret. */
  public conceal(secret: string): void {
    if (secret !== '' && !this.secrets.includes(secret)) {
      this.secrets = [...this.secrets, secret].sort(
        (first, second) => second.length - first.length,
      );
    }
  }

  public write(level: LogLevel, message: string, fields: LogFields): void {
    if (rankOf(level) < rankOf(this.settings.level)) {
      return;
    }
    const line = {
      time: this.clock.now().toString(),
      level,
      message: this.hide(message),
      fields: Object.fromEntries(
        Object.entries(fields).map(([name, value]) => [
          this.hide(name),
          this.hideValue(value),
        ]),
      ),
    };
    this.settings.stream.write(`${JSON.stringify(line)}\n`);
  }

  private hide(text: string): string {
    return this.secrets.reduce(
      (hidden, secret) => hidden.replaceAll(secret, REDACTED),
      text,
    );
  }

  /** A number or a flag that spells a secret is replaced whole. */
  private hideValue(value: LogFields[string]): LogFields[string] {
    if (typeof value === 'string') {
      return this.hide(value);
    }
    const text = String(value);
    return this.hide(text) === text ? value : REDACTED;
  }
}
