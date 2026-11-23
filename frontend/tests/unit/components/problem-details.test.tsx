import { describe, expect, it } from 'vitest';

import {
  faultOf,
  type Problem,
  ProblemDetails,
  problemOf,
} from '#components/problem-details';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const NEXT = 'The screen asks again every second.';

const REFUSED: Problem = {
  kind: 'refused',
  error: { error: 'internal_error', message: 'The service failed to answer.' },
};

function draw(
  headline: string,
  problem: Problem | undefined,
  columns = USUAL_COLUMNS,
): string {
  return drawnAt(
    <ProblemDetails headline={headline} problem={problem} next={NEXT} />,
    columns,
  );
}

describe('ProblemDetails', () => {
  it('should say what the service refused with and its code', () => {
    expect(draw('The list could not be read', REFUSED)).toMatchSnapshot();
  });

  describe('when a request threw', () => {
    it('should say what the client said, with the name of the fault', () => {
      const fault = new TypeError('The answer does not match its schema.');
      const drawn = draw('The list could not be read', {
        kind: 'fault',
        fault,
      });

      expect(drawn).toContain('✕ The list could not be read  TypeError');
      expect(drawn).toContain('THE CLIENT SAID');
      expect(drawn).toContain('The answer does not match its schema.');
    });

    it('should say a fault that is not an error as text', () => {
      const drawn = draw('Not connected', {
        kind: 'fault',
        fault: 'the socket closed',
      });

      expect(drawn).toContain('✕ Not connected  fault');
      expect(drawn).toContain('the socket closed');
    });
  });

  describe('when nothing went wrong', () => {
    it('should draw nothing', () => {
      expect(draw('Not connected', undefined)).toBe('');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const fault = new Error('x'.repeat(200));

    expect(
      widestLine(
        draw('The list could not be read', { kind: 'fault', fault }, columns),
      ),
    ).toBeLessThanOrEqual(columns);
  });
});

describe('problemOf', () => {
  const GONE = new Error('gone');
  const isGone = (failure: unknown): boolean => failure === GONE;
  const LIST = { outcome: 'answered' } as const;
  const REFUSAL = { outcome: 'refused', error: REFUSED.error } as const;

  it('should find nothing wrong with an answer', () => {
    expect(
      problemOf({ answer: LIST, stale: false, failure: undefined }, isGone),
    ).toBeUndefined();
  });

  it('should give the refusal of the last answer', () => {
    expect(
      problemOf({ answer: REFUSAL, stale: false, failure: undefined }, isGone),
    ).toEqual(REFUSED);
  });

  it('should take a fault of the last try over an older refusal', () => {
    const fault = new TypeError('Expected a string.');

    expect(
      problemOf({ answer: REFUSAL, stale: true, failure: fault }, isGone),
    ).toEqual({ kind: 'fault', fault });
  });

  describe('when the service cannot be reached', () => {
    it('should leave the last answer to say what it says', () => {
      expect(
        problemOf({ answer: LIST, stale: true, failure: GONE }, isGone),
      ).toBeUndefined();
      expect(faultOf(GONE, isGone)).toBeUndefined();
    });
  });
});
