import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRepeatedRequest } from '#hooks/use-repeated-request';
import { PATIENT, pause, screenOf } from '#tests/support/keys';

const EVERY_MS = 40;

/** An answer, a failure, or an answer the test gives when it chooses. */
type Scripted = string | Error | Promise<string>;

/** A request that answers in turn, and then keeps its last answer. */
function scripted(answers: readonly Scripted[]): {
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

    await expect.poll(() => screenOf(terminal), PATIENT).toBe('one');
  });

  it('should repeat the request on the timer', async () => {
    const { request, calls } = scripted(['one', 'two']);
    const terminal = render(<Watch request={request} />);

    await expect.poll(() => screenOf(terminal), PATIENT).toBe('two');

    expect(calls()).toBeGreaterThan(1);
  });

  describe('when a request fails', () => {
    it('should keep the last answer and say it is not fresh', async () => {
      const { request } = scripted(['one', new Error('service down')]);
      const terminal = render(<Watch request={request} />);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toBe('one stale (service down)');
    });

    it('should try again and be fresh after an answer', async () => {
      const second = Promise.withResolvers<string>();
      const { request } = scripted([new Error('down'), second.promise]);
      const terminal = render(<Watch request={request} />);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toBe('nothing yet stale (down)');

      second.resolve('one');
      await expect.poll(() => screenOf(terminal), PATIENT).toBe('one');
    });
  });

  describe('when the part is gone', () => {
    it('should stop asking', async () => {
      const { request, calls } = scripted(['one']);
      const terminal = render(<Watch request={request} />);
      await expect.poll(() => screenOf(terminal), PATIENT).toBe('one');

      terminal.unmount();
      const asked = calls();
      await pause(EVERY_MS * 3);

      expect(calls()).toBe(asked);
    });
  });
});
