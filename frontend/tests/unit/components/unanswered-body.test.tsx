import { describe, expect, it } from 'vitest';

import {
  shownOf,
  type Unanswered,
  UnansweredBody,
} from '#components/unanswered-body';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const STILL = { animation: false };

const WAITING: Unanswered = { kind: 'waiting' };

const REFUSED: Unanswered = {
  kind: 'refused',
  error: { error: 'not_found', message: 'No improvement has this id.' },
};

const FAULT: Unanswered = {
  kind: 'fault',
  fault: new TypeError('Expected a string.'),
};

function draw(state: Unanswered, columns = USUAL_COLUMNS): string {
  return drawnAt(
    drawnWith(
      STILL,
      <UnansweredBody
        title="Improvement"
        headline="The improvement could not be read"
        state={state}
      />,
    ),
    columns,
  );
}

describe('UnansweredBody', () => {
  describe('when the answer is on its way', () => {
    it('should say that it asks the service', () => {
      expect(draw(WAITING)).toContain('⠋ Asking the service');
    });
  });

  describe('when the service refused', () => {
    it('should give its sentence, its code and the way back', () => {
      expect(draw(REFUSED)).toMatchSnapshot();
    });
  });

  describe('when the request failed', () => {
    it('should show the fault with its name and its message', () => {
      const drawn = draw(FAULT);

      expect(drawn).toContain('✕ The improvement could not be read');
      expect(drawn).toContain('coverage-autopilot doctor');
      expect(drawn).toContain('TypeError');
      expect(drawn).toContain('Expected a string.');
    });

    it('should show a fault that is not an error as its text', () => {
      expect(draw({ kind: 'fault', fault: 'broken' })).toContain('broken');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    for (const state of [WAITING, REFUSED, FAULT]) {
      expect(widestLine(draw(state, columns))).toBeLessThanOrEqual(columns);
    }
  });
});

describe('shownOf', () => {
  const GONE = new Error('gone');
  const isGone = (failure: unknown): boolean => failure === GONE;
  const LAST = { outcome: 'answered', value: 'last' } as const;

  describe('when nothing answered yet', () => {
    it('should wait', () => {
      const request = { answer: undefined, stale: false, failure: undefined };

      expect(shownOf(request, isGone)).toEqual(WAITING);
    });
  });

  describe('when the service cannot be reached', () => {
    it('should keep the last answer', () => {
      const request = { answer: LAST, stale: true, failure: GONE };

      expect(shownOf(request, isGone)).toEqual({
        kind: 'answered',
        value: 'last',
      });
    });
  });

  describe('when the request failed for another reason', () => {
    it('should show the fault in place of the last answer', () => {
      const fault = new TypeError('Expected a string.');
      const request = { answer: LAST, stale: true, failure: fault };

      expect(shownOf(request, isGone)).toEqual({ kind: 'fault', fault });
    });
  });

  describe('when the service refused', () => {
    it('should show the refusal', () => {
      const refusal = {
        outcome: 'refused',
        error: { error: 'not_found', message: 'No improvement has this id.' },
      } as const;
      const request = { answer: refusal, stale: false, failure: undefined };

      expect(shownOf(request, isGone)).toEqual(REFUSED);
    });
  });
});
