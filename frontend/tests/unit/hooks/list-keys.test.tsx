import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { hintsOf } from '#components/key-hints';
import {
  listActionsOf,
  MOVE_HINT,
  panelActionsOf,
  type PanelPair,
} from '#hooks/list-keys';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { keysOf } from '#hooks/use-screen-actions';
import { useSelection } from '#hooks/use-selection';
import { KEYS, press, screenOf } from '#tests/support/keys';
import { stillPanels, stillSelection } from '#tests/support/still-ways';

const ROWS = 20;
const PAGE = 5;

function List(): ReactNode {
  const selection = useSelection({ count: ROWS, visible: PAGE });
  useKeys(keysOf(listActionsOf(selection)), { active: true });
  return <Text>{`row ${String(selection.index + 1)}`}</Text>;
}

afterEach(cleanup);

describe('listActionsOf', () => {
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

  it('should name the moves once in the footer, with the words it is given', () => {
    expect(hintsOf(listActionsOf(stillSelection(), MOVE_HINT))).toEqual([
      { key: 'up-down', label: 'move' },
    ]);
    expect(hintsOf(listActionsOf(stillSelection()))).toEqual([]);
  });

  it('should leave the moves out of the list of commands', () => {
    expect(
      listActionsOf(stillSelection(), MOVE_HINT).filter(
        ({ command }) => command !== undefined,
      ),
    ).toEqual([]);
  });
});

const PANELS = ['list', 'details'] as const;

function Panels(): ReactNode {
  const ring = useFocusRing(PANELS);
  const pair: PanelPair<'list' | 'details'> = {
    ring,
    names: PANELS,
    words: PANELS,
  };
  useKeys(keysOf(panelActionsOf(pair, 'wide')), { active: true });
  return <Text>{`focus on the ${ring.focused}`}</Text>;
}

describe('panelActionsOf', () => {
  it('should give the focus to the other panel on tab', async () => {
    const terminal = render(<Panels />);

    await press(terminal, KEYS.tab);
    expect(screenOf(terminal)).toBe('focus on the details');

    await press(terminal, KEYS.tab);
    expect(screenOf(terminal)).toBe('focus on the list');
  });

  it('should open the details on the right arrow and go back on the left', async () => {
    const terminal = render(<Panels />);

    await press(terminal, KEYS.right);
    expect(screenOf(terminal)).toBe('focus on the details');

    await press(terminal, KEYS.left);
    expect(screenOf(terminal)).toBe('focus on the list');
  });

  it.each([
    ['list', 'wide', { key: 'tab', label: 'details' }],
    ['list', 'narrow', { key: 'right', label: 'details' }],
    ['details', 'narrow', { key: 'tab', label: 'list' }],
  ] as const)(
    'should name the way from the %s in the %s layout',
    (focused, layout, hint) => {
      expect(hintsOf(panelActionsOf(stillPanels(focused), layout))).toEqual([
        hint,
      ]);
    },
  );
});
