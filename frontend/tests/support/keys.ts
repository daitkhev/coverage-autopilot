import type { render } from 'ink-testing-library';

import { plainText } from '#tests/support/terminal-text';

const ESCAPE = '\u001B';

/** What a terminal sends for a key. */
export const KEYS = {
  up: `${ESCAPE}[A`,
  down: `${ESCAPE}[B`,
  right: `${ESCAPE}[C`,
  left: `${ESCAPE}[D`,
  pageUp: `${ESCAPE}[5~`,
  pageDown: `${ESCAPE}[6~`,
  enter: '\r',
  escape: ESCAPE,
  tab: '\t',
  shiftTab: `${ESCAPE}[Z`,
  backspace: '\u007F',
  ctrlC: '\u0003',
} as const;

type Terminal = ReturnType<typeof render>;

/** Ink reads a lone escape only after a short wait for more of a sequence. */
const SETTLE_MS = 30;

/**
 * How long a test waits for what the terminal shows, and how often it
 * looks. A loaded machine draws late, so a fixed pause proves nothing
 * about a thing that is going to happen: only about one that must not.
 */
export const PATIENT = { timeout: 5000, interval: 10 } as const;

/** Lets the real timers run for a while. */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Sends keys one at a time, and waits for the terminal to draw each. */
export async function press(
  terminal: Terminal,
  ...keys: readonly string[]
): Promise<void> {
  await pause(SETTLE_MS);
  for (const key of keys) {
    terminal.stdin.write(key);
    await pause(SETTLE_MS);
  }
}

/** The last frame the terminal drew, as plain text. */
export function screenOf(terminal: Terminal): string {
  return plainText(terminal.lastFrame() ?? '');
}
