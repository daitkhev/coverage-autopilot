import type { Writable } from 'node:stream';

/** The levels of a line, from the least to the most urgent. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogSettings {
  /** Where the lines go, such as the standard error of the service. */
  readonly stream: Writable;
  /** The least urgent level that is written. */
  readonly level: LogLevel;
  /** Values replaced in every line, such as a token of the environment. */
  readonly secrets: readonly string[];
}

/** The injection token of the settings of the logger. */
export const LOG_SETTINGS = Symbol('LogSettings');
