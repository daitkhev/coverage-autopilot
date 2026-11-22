import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { type ActionState, useAction } from '#hooks/use-action';
import { useKeys } from '#hooks/use-keys';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';

function said(state: ActionState<string>): string {
  switch (state.phase) {
    case 'idle':
      return 'idle';
    case 'running':
      return 'running';
    case 'ended':
      return `ended: ${state.outcome}`;
    case 'failed':
      return `failed: ${String(state.failure)}`;
  }
}

/** Starts the work on `enter`, and shows where the action is. */
function Starter({
  work,
}: {
  readonly work: () => Promise<string>;
}): ReactNode {
  const action = useAction<string>();
  useKeys(
    {
      enter: () => {
        action.start(work);
      },
    },
    { active: true },
  );
  return <Text>{said(action.state)}</Text>;
}

/** Work that ends when the test says, and counts how often it started. */
function controlled(): {
  readonly work: () => Promise<string>;
  readonly started: () => number;
  readonly finish: (outcome: string) => void;
} {
  let count = 0;
  let pending = Promise.withResolvers<string>();
  return {
    work: () => {
      count += 1;
      return pending.promise;
    },
    started: () => count,
    finish: (outcome) => {
      pending.resolve(outcome);
      pending = Promise.withResolvers<string>();
    },
  };
}

afterEach(cleanup);

describe('useAction', () => {
  it('should be idle before a key starts it', () => {
    const terminal = render(<Starter work={() => Promise.resolve('done')} />);

    expect(screenOf(terminal)).toBe('idle');
  });

  it('should say it runs and then what it ended with', async () => {
    const { work, finish } = controlled();
    const terminal = render(<Starter work={work} />);

    await press(terminal, KEYS.enter);
    expect(screenOf(terminal)).toBe('running');

    finish('done');
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('ended: done');
  });

  it('should start nothing on a second key while the work runs', async () => {
    const { work, started, finish } = controlled();
    const terminal = render(<Starter work={work} />);

    await press(terminal, KEYS.enter, KEYS.enter, KEYS.enter);
    finish('done');
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('ended: done');

    expect(started()).toBe(1);
  });

  it('should start again once the work has ended', async () => {
    const { work, started, finish } = controlled();
    const terminal = render(<Starter work={work} />);
    await press(terminal, KEYS.enter);
    finish('first');
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('ended: first');

    await press(terminal, KEYS.enter);
    finish('second');

    await expect.poll(() => screenOf(terminal), PATIENT).toBe('ended: second');
    expect(started()).toBe(2);
  });

  describe('when the work fails', () => {
    it('should keep the failure as the outcome of the action', async () => {
      const terminal = render(
        <Starter work={() => Promise.reject(new Error('down'))} />,
      );

      await press(terminal, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toBe('failed: Error: down');
    });
  });
});
