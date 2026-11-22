import { describe, expect, it } from 'vitest';

import { type Unanswered, UnansweredBody } from '#components/unanswered-body';
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
    drawnWith(STILL, <UnansweredBody title="Improvement" state={state} />),
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

      expect(drawn).toContain('✕ The request to the service failed.');
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
