import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { listKeysOf } from '#hooks/list-keys';
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
