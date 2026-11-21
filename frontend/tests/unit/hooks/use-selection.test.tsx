import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useKeys } from '#hooks/use-keys';
import { type ListSize, positionOf, useSelection } from '#hooks/use-selection';
import { KEYS, press, screenOf } from '#tests/support/keys';

function List(size: ListSize): ReactNode {
  const selection = useSelection(size);
  useKeys(
    {
      down: () => {
        selection.moveBy(1);
      },
      up: () => {
        selection.moveBy(-1);
      },
      pgdn: () => {
        selection.pageBy(1);
      },
      pgup: () => {
        selection.pageBy(-1);
      },
      g: selection.first,
      G: selection.last,
      '5': () => {
        selection.moveTo(5);
      },
    },
    { active: true },
  );
  return (
    <Text>{`row ${String(selection.index)} from ${String(selection.offset)}`}</Text>
  );
}

afterEach(cleanup);

describe('positionOf', () => {
  it('should keep the chosen row inside the list', () => {
    expect(
      positionOf({ index: 9, offset: 0 }, { count: 3, visible: 5 }),
    ).toEqual({ index: 2, offset: 0 });
  });

  it('should scroll down just far enough to show the chosen row', () => {
    expect(
      positionOf({ index: 6, offset: 0 }, { count: 20, visible: 5 }),
    ).toEqual({ index: 6, offset: 2 });
  });

  it('should scroll up to the chosen row', () => {
    expect(
      positionOf({ index: 1, offset: 4 }, { count: 20, visible: 5 }),
    ).toEqual({ index: 1, offset: 1 });
  });

  it('should leave no empty rows below the end of the list', () => {
    expect(
      positionOf({ index: 9, offset: 9 }, { count: 10, visible: 5 }),
    ).toEqual({ index: 9, offset: 5 });
  });

  it('should stay at the start of an empty list', () => {
    expect(
      positionOf({ index: 3, offset: 3 }, { count: 0, visible: 0 }),
    ).toEqual({ index: 0, offset: 0 });
  });
});

describe('useSelection', () => {
  it('should start on the first row', () => {
    const terminal = render(<List count={20} visible={5} />);

    expect(screenOf(terminal)).toBe('row 0 from 0');
  });

  it('should move one row at a time', async () => {
    const terminal = render(<List count={20} visible={5} />);

    await press(terminal, KEYS.down, KEYS.down, KEYS.down, KEYS.up);

    expect(screenOf(terminal)).toBe('row 2 from 0');
  });

  it('should move one page at a time', async () => {
    const terminal = render(<List count={20} visible={5} />);

    await press(terminal, KEYS.pageDown, KEYS.pageDown, KEYS.pageUp);

    expect(screenOf(terminal)).toBe('row 5 from 5');
  });

  it('should jump to the last row and back to the first', async () => {
    const terminal = render(<List count={20} visible={5} />);

    await press(terminal, 'G');
    expect(screenOf(terminal)).toBe('row 19 from 15');

    await press(terminal, 'g');
    expect(screenOf(terminal)).toBe('row 0 from 0');
  });

  it('should not move past either end', async () => {
    const terminal = render(<List count={3} visible={5} />);

    await press(terminal, KEYS.up, KEYS.down, KEYS.down, KEYS.down);

    expect(screenOf(terminal)).toBe('row 2 from 0');
  });

  describe('when fewer rows fit on the screen', () => {
    it('should keep the chosen row and show it', async () => {
      const terminal = render(<List count={20} visible={10} />);
      await press(terminal, '5');

      terminal.rerender(<List count={20} visible={3} />);
      await press(terminal);

      expect(screenOf(terminal)).toBe('row 5 from 3');
    });
  });
});
