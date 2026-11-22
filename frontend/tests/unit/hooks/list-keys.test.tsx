import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { browseKeysOf, listKeysOf } from '#hooks/list-keys';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { useSelection } from '#hooks/use-selection';
import { KEYS, press, screenOf } from '#tests/support/keys';

const ROWS = 20;
const PAGE = 5;

function List(): ReactNode {
  const selection = useSelection({ count: ROWS, visible: PAGE });
  useKeys(listKeysOf(selection), { active: true });
  return <Text>{`row ${String(selection.index + 1)}`}</Text>;
}

afterEach(cleanup);

describe('listKeysOf', () => {
  it('should move one row with the arrows', async () => {
    const terminal = render(<List />);

    await press(terminal, KEYS.down, KEYS.down, KEYS.up);

    expect(screenOf(terminal)).toBe('row 2');
  });

  it('should move one row with j and k', async () => {
    const terminal = render(<List />);

    await press(terminal, 'j', 'j', 'j', 'k');

    expect(screenOf(terminal)).toBe('row 3');
  });

  it('should move one page', async () => {
    const terminal = render(<List />);

    await press(terminal, KEYS.pageDown, KEYS.pageDown, KEYS.pageUp);

    expect(screenOf(terminal)).toBe('row 6');
  });

  it('should go to the last row and back to the first', async () => {
    const terminal = render(<List />);

    await press(terminal, 'G');
    expect(screenOf(terminal)).toBe('row 20');

    await press(terminal, 'g');
    expect(screenOf(terminal)).toBe('row 1');
  });
});

const PANELS = ['list', 'details'] as const;

function Browser(): ReactNode {
  const selection = useSelection({ count: ROWS, visible: PAGE });
  const ring = useFocusRing(PANELS);
  useKeys(browseKeysOf(selection, ring), { active: true });
  return (
    <Text>{`row ${String(selection.index + 1)} in the ${ring.focused}`}</Text>
  );
}

describe('browseKeysOf', () => {
  it('should move the list while it has the focus', async () => {
    const terminal = render(<Browser />);

    await press(terminal, KEYS.down, 'j');

    expect(screenOf(terminal)).toBe('row 3 in the list');
  });

  it('should give the focus to the other panel on tab', async () => {
    const terminal = render(<Browser />);

    await press(terminal, KEYS.tab);
    expect(screenOf(terminal)).toBe('row 1 in the details');

    await press(terminal, KEYS.tab);
    expect(screenOf(terminal)).toBe('row 1 in the list');
  });

  it('should open the details on the right arrow and go back on the left', async () => {
    const terminal = render(<Browser />);

    await press(terminal, KEYS.right);
    expect(screenOf(terminal)).toBe('row 1 in the details');

    await press(terminal, KEYS.left);
    expect(screenOf(terminal)).toBe('row 1 in the list');
  });

  describe('when the details have the focus', () => {
    it('should not move the list', async () => {
      const terminal = render(<Browser />);

      await press(terminal, KEYS.right, KEYS.down, 'G');

      expect(screenOf(terminal)).toBe('row 1 in the details');
    });
  });
});
