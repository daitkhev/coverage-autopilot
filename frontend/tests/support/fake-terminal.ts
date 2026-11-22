import { EventEmitter } from 'node:events';

import type { Terminal } from '#app/interactive';
import { plainText } from '#tests/support/terminal-text';

/** The size of the mock-ups. */
const COLUMNS = 112;
const ROWS = 34;

/** The end of a terminal Ink writes to. It keeps what was written. */
function fakeOutput(written: string[]): EventEmitter {
  return Object.assign(new EventEmitter(), {
    columns: COLUMNS,
    rows: ROWS,
    isTTY: true,
    // Ink waits for its last write before it says the screens are gone.
    write: (text: string, done?: () => void): boolean => {
      written.push(text);
      done?.();
      return true;
    },
  });
}

/** The end of a terminal Ink reads from: the keys a test has pressed. */
function fakeInput(pressed: string[]): EventEmitter {
  const nothing = (): undefined => undefined;
  return Object.assign(new EventEmitter(), {
    isTTY: true,
    read: (): string | null => pressed.shift() ?? null,
    setEncoding: nothing,
    setRawMode: nothing,
    ref: nothing,
    unref: nothing,
  });
}

/** A terminal of a test: what was drawn on it, and a way to press a key. */
export interface FakeTerminal {
  /** What the real code is handed. */
  readonly ends: Terminal;
  /** Everything drawn so far, as plain text. */
  readonly drawn: () => string;
  readonly press: (key: string) => void;
}

/**
 * The two ends of a terminal that no test library has drawn on: Ink
 * draws one tree for each output, so a fresh one is made for each run.
 */
export function fakeTerminal(): FakeTerminal {
  const written: string[] = [];
  const pressed: string[] = [];
  const stdout = fakeOutput(written);
  const stdin = fakeInput(pressed);
  return {
    // The fakes hold the part of a stream that Ink uses, and no more.
    ends: { stdout, stdin } as unknown as Terminal,
    drawn: () => plainText(written.join('')),
    press: (key) => {
      pressed.push(key);
      stdin.emit('readable');
    },
  };
}
