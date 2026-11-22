import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDatedRequest } from '#hooks/use-dated-request';
import { PATIENT, screenOf } from '#tests/support/keys';

const EVERY_MS = 40;
const FIRST = '2026-11-21T14:05:00.000Z';
const LATER = '2026-11-21T14:05:09.000Z';

/** A clock a test moves, and a request that answers, then fails. */
function scripted(answers: readonly (string | Error)[]): {
  readonly request: () => Promise<string>;
  readonly now: () => string;
  readonly moveTo: (moment: string) => void;
} {
  let count = 0;
  let moment = FIRST;
  return {
    request: () => {
      const answer = answers[Math.min(count, answers.length - 1)] ?? '';
      count += 1;
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    },
    now: () => moment,
    moveTo: (next) => {
      moment = next;
    },
  };
}

function Watch({
  request,
  now,
}: {
  readonly request: () => Promise<string>;
  readonly now: () => string;
}): ReactNode {
  const { answer, answeredAt, stale } = useDatedRequest(request, {
    now,
    everyMs: EVERY_MS,
  });
  return (
    <Text>{`${answer ?? 'nothing'} at ${answeredAt ?? 'no moment'}${stale ? ' stale' : ''}`}</Text>
  );
}

afterEach(cleanup);

describe('useDatedRequest', () => {
  it('should keep the moment the answer came', async () => {
    const { request, now } = scripted(['one']);
    const terminal = render(<Watch request={request} now={now} />);

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toBe(`one at ${FIRST}`);
  });

  it('should take the moment again with every answer', async () => {
    const clock = scripted(['one', 'two']);
    const terminal = render(<Watch request={clock.request} now={clock.now} />);
    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain(`at ${FIRST}`);

    clock.moveTo(LATER);

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toBe(`two at ${LATER}`);
  });

  describe('when a request fails', () => {
    it('should keep the moment of the last answer', async () => {
      const clock = scripted(['one', new Error('service down')]);
      const terminal = render(
        <Watch request={clock.request} now={clock.now} />,
      );
      await expect.poll(() => screenOf(terminal), PATIENT).toContain('one');

      clock.moveTo(LATER);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toBe(`one at ${FIRST} stale`);
    });

    it('should have no moment before the first answer', async () => {
      const { request, now } = scripted([new Error('service down')]);
      const terminal = render(<Watch request={request} now={now} />);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toBe('nothing at no moment stale');
    });
  });
});
