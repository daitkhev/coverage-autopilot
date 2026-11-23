import { describe, expect, it } from 'vitest';

import { type Answer, AnswerList } from '#components/answer-list';
import {
  drawnAt,
  drawnWith,
  styledAt,
  USUAL_COLUMNS,
} from '#tests/support/terminal-text';

const ANSWERS: readonly Answer[] = [
  { label: 'Decide later' },
  { label: 'Reject the patch', destroys: true },
];

describe('AnswerList', () => {
  it('should number the answers and mark the chosen one', () => {
    expect(
      drawnAt(
        <AnswerList answers={ANSWERS} selected={1} focused />,
        USUAL_COLUMNS,
      ),
    ).toBe('  1. Decide later\n› 2. Reject the patch');
  });

  describe('when an answer destroys work', () => {
    it('should draw it in another style than the safe one', () => {
      const drawn = styledAt(
        drawnWith(
          { colour: true },
          <AnswerList answers={ANSWERS} selected={0} focused={false} />,
        ),
        USUAL_COLUMNS,
      );
      const [safe = '', destroys = ''] = drawn.split('\n');

      expect(destroys.replace('2. Reject the patch', '')).not.toBe(
        safe.replace('1. Decide later', ''),
      );
    });
  });
});
