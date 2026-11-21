import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { KEYS, press, screenOf } from '#tests/support/keys';

type PanelName = 'list' | 'details' | 'question';

function Screen({
  panels,
}: {
  readonly panels: readonly [PanelName, ...PanelName[]];
}): ReactNode {
  const ring = useFocusRing(panels);
  useKeys(
    {
      tab: ring.next,
      d: () => {
        ring.focus('details');
      },
    },
    { active: true },
  );
  return <Text>{`focus on ${ring.focused}`}</Text>;
}

afterEach(cleanup);

describe('useFocusRing', () => {
  it('should give the focus to the first panel', () => {
    const terminal = render(<Screen panels={['list', 'details']} />);

    expect(screenOf(terminal)).toBe('focus on list');
  });

  it('should move the focus round the panels', async () => {
    const terminal = render(<Screen panels={['list', 'details']} />);

    await press(terminal, KEYS.tab);
    expect(screenOf(terminal)).toBe('focus on details');

    await press(terminal, KEYS.tab);
    expect(screenOf(terminal)).toBe('focus on list');
  });

  it('should give the focus to a named panel', async () => {
    const terminal = render(<Screen panels={['list', 'details']} />);

    await press(terminal, 'd');

    expect(screenOf(terminal)).toBe('focus on details');
  });

  describe('when the focused panel is gone', () => {
    it('should give the focus to the first panel', async () => {
      const terminal = render(<Screen panels={['list', 'details']} />);
      await press(terminal, KEYS.tab);

      terminal.rerender(<Screen panels={['list']} />);
      await press(terminal);

      expect(screenOf(terminal)).toBe('focus on list');
    });
  });
});
