import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useKeys } from '#hooks/use-keys';
import {
  keysOf,
  type OfferedActions,
  offeredActions,
  OfferedContext,
  type ScreenAction,
  useOfferedActions,
  useScreenActions,
} from '#hooks/use-screen-actions';
import { PATIENT, press, screenOf } from '#tests/support/keys';

function noted(log: string[], word: string): () => void {
  return () => {
    log.push(word);
  };
}

/** A screen with one action, whose keys work while it is active. */
function Screen({ active }: { readonly active: boolean }): ReactNode {
  const [count, setCount] = useState(0);
  useScreenActions(
    [
      {
        key: 'x',
        run: () => {
          setCount((last) => last + 1);
        },
        command: { title: `Count ${String(count)}` },
      },
    ],
    { active },
  );
  return <Text>{`counted ${String(count)}`}</Text>;
}

/** What the screen offers, as the list of commands reads it. */
function Offered({ offers }: { readonly offers: OfferedActions }): ReactNode {
  const titles = useOfferedActions(offers).map(({ command }) => command?.title);
  return <Text>{`offered ${titles.join(', ') || 'nothing'}`}</Text>;
}

function Both({
  offers,
  active,
}: {
  readonly offers: OfferedActions;
  readonly active: boolean;
}): ReactNode {
  return (
    <OfferedContext value={offers}>
      <Screen active={active} />
      <Offered offers={offers} />
    </OfferedContext>
  );
}

afterEach(cleanup);

describe('keysOf', () => {
  it('should run each action on its key, and leave out one without a key', async () => {
    const log: string[] = [];
    const actions: ScreenAction[] = [
      { key: 'a', run: noted(log, 'a') },
      { run: noted(log, 'none') },
    ];
    function Keys(): ReactNode {
      useKeys(keysOf(actions), { active: true });
      return null;
    }
    const terminal = render(<Keys />);

    await press(terminal, 'a', 'b');

    expect(Object.keys(keysOf(actions))).toEqual(['a']);
    expect(log).toEqual(['a']);
  });
});

describe('offeredActions', () => {
  it('should tell who listens of each offer, until they stop', () => {
    const offers = offeredActions();
    const told: number[] = [];
    const stop = offers.subscribe(() => {
      told.push(offers.current().length);
    });
    const actions = [{ key: 'a', run: noted([], 'a') }];

    offers.offer(actions);
    stop();
    offers.offer([]);

    expect(told).toEqual([1]);
  });

  it('should take back an offer only while it is the last one', () => {
    const offers = offeredActions();
    const first = [{ key: 'a', run: noted([], 'a') }];
    const second = [{ key: 'b', run: noted([], 'b') }];

    offers.offer(first);
    offers.offer(second);
    offers.withdraw(first);
    expect(offers.current()).toBe(second);

    offers.withdraw(second);
    expect(offers.current()).toEqual([]);
  });
});

describe('useScreenActions', () => {
  it('should offer the actions as they are now, and run them on their keys', async () => {
    const offers = offeredActions();
    const terminal = render(<Both offers={offers} active />);
    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('offered Count 0');

    await press(terminal, 'x');

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('offered Count 1');
    expect(screenOf(terminal)).toContain('counted 1');
  });

  it('should offer nothing while its keys do nothing', async () => {
    const offers = offeredActions();
    const terminal = render(<Both offers={offers} active={false} />);

    await press(terminal, 'x');

    expect(screenOf(terminal)).toContain('offered nothing');
    expect(screenOf(terminal)).toContain('counted 0');
  });

  it('should take its offer back when it goes', async () => {
    const offers = offeredActions();
    const terminal = render(<Both offers={offers} active />);
    await expect.poll(() => offers.current().length, PATIENT).toBe(1);

    terminal.unmount();

    expect(offers.current()).toEqual([]);
  });

  it('should still run its keys where nothing reads the offers', async () => {
    const terminal = render(<Screen active />);

    await press(terminal, 'x');

    expect(screenOf(terminal)).toBe('counted 1');
  });
});
