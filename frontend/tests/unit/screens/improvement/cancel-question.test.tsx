import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import { CancelQuestion } from '#screens/improvement/cancel-question';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { NARROW } from '#tests/support/sample-work-frame';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const { verifying, cancelled } = IMPROVEMENT_BY_STATUS;

function asked(scripted: Partial<ServiceApi> = {}) {
  const log: string[] = [];
  const session = fakeSession(scripted);
  const question = (
    <CancelQuestion
      session={session}
      improvement={verifying}
      onClose={() => {
        log.push('closed');
      }}
    />
  );
  const tree = <>{drawnWith({ animation: false }, question)}</>;
  return { terminal: renderAt(tree, NARROW), log, calls: session.api.calls };
}

function cancels(calls: ReturnType<typeof asked>['calls']) {
  return calls.filter((call) => call.method === 'cancelImprovement');
}

afterEach(cleanup);

describe('CancelQuestion', () => {
  it('should say what is spent for good, with the safe answer chosen', () => {
    const { terminal } = asked();

    const frame = frameOf(terminal);
    expect(frame).toContain('2 attempts and 93,000 tokens are already spent');
    expect(frame).toContain('› 1. Keep it running');
    expect(widestLine(frame)).toBeLessThanOrEqual(NARROW.columns);
  });

  describe('when the work is kept', () => {
    it('should close and send nothing', async () => {
      const { terminal, log, calls } = asked();

      await press(terminal, KEYS.enter);

      expect(log).toEqual(['closed']);
      expect(calls).toEqual([]);
    });
  });

  describe('when the cancel is confirmed', () => {
    it('should send it once, however often enter is pressed', async () => {
      const { terminal, log, calls } = asked({
        cancelImprovement: () => new Promise(() => undefined),
      });

      await press(terminal, '2', KEYS.enter, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Cancelling the improvement');
      expect(cancels(calls)).toEqual([
        { method: 'cancelImprovement', arguments: [verifying.id] },
      ]);
      expect(log).toEqual([]);
    });

    it('should close once the service took it', async () => {
      const { terminal, log } = asked({
        cancelImprovement: () => Promise.resolve(answered(cancelled, 202)),
      });

      await press(terminal, KEYS.down, KEYS.enter);

      await expect.poll(() => log, PATIENT).toEqual(['closed']);
    });
  });

  describe('when the service refuses the cancel', () => {
    it('should give its sentence and its code, and stay open', async () => {
      const { terminal, log } = asked({
        cancelImprovement: () =>
          Promise.resolve(
            refused(404, {
              error: 'not_found',
              message: 'No improvement has this id.',
            }),
          ),
      });

      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! No improvement has this id. not_found');
      expect(log).toEqual([]);
    });
  });

  describe('when nothing answers the cancel', () => {
    it('should say so', async () => {
      const { terminal } = asked({
        cancelImprovement: () => Promise.reject(new Error('socket closed')),
      });

      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Nothing answered the cancel: socket closed');
    });
  });
});
