import { type Key, useInput } from 'ink';

import { useBackdrop } from '#hooks/use-backdrop';

/** What a key does, by the name of the key: `up`, `enter`, `q`, `ctrl+c`. */
export type KeyHandlers = Readonly<Partial<Record<string, () => void>>>;

export interface KeyOptions {
  /** Whether this part takes the keys now. */
  readonly active: boolean;
  /** A text field gets the letters no handler takes. */
  readonly onText?: (text: string) => void;
}

const NAMED_KEYS: readonly (readonly [keyof Key, string])[] = [
  ['upArrow', 'up'],
  ['downArrow', 'down'],
  ['leftArrow', 'left'],
  ['rightArrow', 'right'],
  ['pageUp', 'pgup'],
  ['pageDown', 'pgdn'],
  ['return', 'enter'],
  ['escape', 'esc'],
  ['tab', 'tab'],
  ['backspace', 'backspace'],
  ['delete', 'backspace'],
];

function namedKeyOf(key: Key): string | undefined {
  return NAMED_KEYS.find(([field]) => key[field] === true)?.[1];
}

/** The name of a key as the keys table of the design writes it. */
export function keyNameOf(input: string, key: Key): string {
  const named = namedKeyOf(key);
  if (named !== undefined) {
    return key.shift ? `shift+${named}` : named;
  }
  return key.ctrl ? `ctrl+${input}` : input;
}

function isText(input: string, key: Key): boolean {
  return (
    input !== '' && namedKeyOf(key) === undefined && !key.ctrl && !key.meta
  );
}

function handlerOf(
  handlers: KeyHandlers,
  name: string,
): (() => void) | undefined {
  return Object.hasOwn(handlers, name) ? handlers[name] : undefined;
}

/**
 * Runs the handler of a pressed key. In a text field letters type and run
 * no action. A part behind a dialog takes no key, whatever it asks for, so
 * a dialog takes every key.
 */
export function useKeys(handlers: KeyHandlers, options: KeyOptions): void {
  const behind = useBackdrop();
  useInput(
    (input, key) => {
      if (options.onText !== undefined && isText(input, key)) {
        options.onText(input);
        return;
      }
      handlerOf(handlers, keyNameOf(input, key))?.();
    },
    { isActive: options.active && !behind },
  );
}
