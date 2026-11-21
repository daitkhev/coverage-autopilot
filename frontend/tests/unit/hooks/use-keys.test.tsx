import { type Key, Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BackdropContext } from '#hooks/use-backdrop';
import { keyNameOf, useKeys } from '#hooks/use-keys';
import { KEYS, press, screenOf } from '#tests/support/keys';

const NO_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
};

function Probe({
  active,
  typing = false,
}: {
  readonly active: boolean;
  readonly typing?: boolean;
}): ReactNode {
  const [log, setLog] = useState<readonly string[]>([]);
  const note = (entry: string) => () => {
    setLog((last) => [...last, entry]);
  };
  useKeys(
    { up: note('up'), enter: note('enter'), q: note('q'), esc: note('esc') },
    typing
      ? {
          active,
          onText: (text) => {
            note(`text ${text}`)();
          },
        }
      : { active },
  );
  return <Text>{`log [${log.join(', ')}]`}</Text>;
}

afterEach(cleanup);

describe('keyNameOf', () => {
  it.each([
    [{ upArrow: true }, '', 'up'],
    [{ pageDown: true }, '', 'pgdn'],
    [{ return: true }, '\r', 'enter'],
    [{ escape: true }, '', 'esc'],
    [{ delete: true }, '', 'backspace'],
    [{ tab: true, shift: true }, '', 'shift+tab'],
    [{ ctrl: true }, 'c', 'ctrl+c'],
    [{}, 'G', 'G'],
  ])('should name %o with input %j as %s', (pressed, input, name) => {
    expect(keyNameOf(input, { ...NO_KEY, ...pressed })).toBe(name);
  });
});

describe('useKeys', () => {
  it('should run the handler of a pressed key', async () => {
    const terminal = render(<Probe active />);

    await press(terminal, KEYS.up, 'q', KEYS.enter, KEYS.escape);

    expect(screenOf(terminal)).toBe('log [up, q, enter, esc]');
  });

  it('should ignore a key that has no handler', async () => {
    const terminal = render(<Probe active />);

    await press(terminal, 'x', KEYS.down);

    expect(screenOf(terminal)).toBe('log []');
  });

  describe('when the part is a text field', () => {
    it('should type the letters and run no action', async () => {
      const terminal = render(<Probe active typing />);

      await press(terminal, 's', 'q', KEYS.ctrlC, KEYS.enter);

      expect(screenOf(terminal)).toBe('log [text s, text q, enter]');
    });
  });

  describe('when the part is not active', () => {
    it('should take no key', async () => {
      const terminal = render(<Probe active={false} />);

      await press(terminal, KEYS.up);

      expect(screenOf(terminal)).toBe('log []');
    });
  });

  describe('when the part is behind a dialog', () => {
    it('should take no key, whatever it asks for', async () => {
      const terminal = render(
        <BackdropContext value>
          <Probe active />
        </BackdropContext>,
      );

      await press(terminal, KEYS.up, KEYS.enter);

      expect(screenOf(terminal)).toBe('log []');
    });
  });
});
