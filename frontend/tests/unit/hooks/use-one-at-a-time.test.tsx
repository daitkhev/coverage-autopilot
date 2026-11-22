import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useKeys } from '#hooks/use-keys';
import { useOneAtATime } from '#hooks/use-one-at-a-time';
import { PATIENT, press, screenOf } from '#tests/support/keys';

/** An action the test ends when it chooses, and how often it started. */
function slowAction(): {
  readonly action: () => Promise<void>;
  readonly starts: () => number;
  readonly end: () => void;
} {
  let count = 0;
  let ending = Promise.withResolvers<undefined>();
  return {
    action: async () => {
      count += 1;
      await ending.promise;
      ending = Promise.withResolvers<undefined>();
    },
    starts: () => count,
    end: () => {
      ending.resolve(undefined);
    },
  };
}

function Runner({
  action,
}: {
  readonly action: () => Promise<void>;
}): ReactNode {
  const once = useOneAtATime();
  useKeys(
    {
      r: () => {
        once.run(action);
      },
    },
    { active: true },
  );
  return <Text>{once.running ? 'running' : 'idle'}</Text>;
}

afterEach(cleanup);

describe('useOneAtATime', () => {
  it('should run the action and say that it runs', async () => {
    const slow = slowAction();
    const terminal = render(<Runner action={slow.action} />);

    await press(terminal, 'r');

    expect(slow.starts()).toBe(1);
    expect(screenOf(terminal)).toBe('running');
  });

  it('should start nothing on a second press while it runs', async () => {
    const slow = slowAction();
    const terminal = render(<Runner action={slow.action} />);

    await press(terminal, 'r', 'r', 'r');

    expect(slow.starts()).toBe(1);
  });

  describe('when the action has ended', () => {
    it('should run it again on the next press', async () => {
      const slow = slowAction();
      const terminal = render(<Runner action={slow.action} />);
      await press(terminal, 'r');

      slow.end();
      await expect.poll(() => screenOf(terminal), PATIENT).toBe('idle');
      await press(terminal, 'r');

      expect(slow.starts()).toBe(2);
    });
  });
});
