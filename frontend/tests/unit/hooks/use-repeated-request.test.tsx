import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRepeatedRequest } from '#hooks/use-repeated-request';
import { pause, screenOf } from '#tests/support/keys';

const EVERY_MS = 40;

/** A request that answers in turn, and then keeps its last answer. */
function scripted(answers: readonly (string | Error)[]): {
  readonly request: () => Promise<string>;
  readonly calls: () => number;
} {
  let count = 0;
  return {
    request: () => {
      const answer = answers[Math.min(count, answers.length - 1)] ?? '';
      count += 1;
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    },
    calls: () => count,
  };
}

function Watch({
  request,
}: {
  readonly request: () => Promise<string>;
}): ReactNode {
  const { answer, stale, failure } = useRepeatedRequest(request, EVERY_MS);
  const said = failure instanceof Error ? ` (${failure.message})` : '';
  return (
    <Text>{`${answer ?? 'nothing yet'}${stale ? ' stale' : ''}${said}`}</Text>
  );
}

afterEach(cleanup);

describe('useRepeatedRequest', () => {
  it('should show the first answer', async () => {
    const { request } = scripted(['one']);
    const terminal = render(<Watch request={request} />);

    await pause(EVERY_MS / 2);

    expect(screenOf(terminal)).toBe('one');
  });

  it('should repeat the request on the timer', async () => {
    const { request, calls } = scripted(['one', 'two']);
    const terminal = render(<Watch request={request} />);

    await pause(EVERY_MS * 3);

    expect(calls()).toBeGreaterThan(1);
    expect(screenOf(terminal)).toBe('two');
  });

  describe('when a request fails', () => {
    it('should keep the last answer and say it is not fresh', async () => {
      const { request } = scripted(['one', new Error('service down')]);
      const terminal = render(<Watch request={request} />);

      await pause(EVERY_MS * 2);

      expect(screenOf(terminal)).toBe('one stale (service down)');
    });

    it('should try again and be fresh after an answer', async () => {
      const { request } = scripted([new Error('down'), 'one']);
      const terminal = render(<Watch request={request} />);

      await pause(EVERY_MS / 2);
      expect(screenOf(terminal)).toBe('nothing yet stale (down)');

      await pause(EVERY_MS * 2);
      expect(screenOf(terminal)).toBe('one');
    });
  });

  describe('when the part is gone', () => {
    it('should stop asking', async () => {
      const { request, calls } = scripted(['one']);
      const terminal = render(<Watch request={request} />);
      await pause(EVERY_MS / 2);

      terminal.unmount();
      const asked = calls();
      await pause(EVERY_MS * 3);

      expect(calls()).toBe(asked);
    });
  });
});
