import { describe, expect, it } from 'vitest';

import { ErrorDetails } from '#components/error-details';
import { drawnAt, widestLine, WIDTHS } from '#tests/support/terminal-text';
import { FILE_STATE, IMPROVEMENT_STATUS } from '#theme/status';

const PANEL_COLUMNS = 60;

const REFUSED = (
  <ErrorDetails
    look={IMPROVEMENT_STATUS.failed}
    headline="Not connected"
    code="push_denied"
    explanation="The access check stopped at the third step."
    answer={{
      heading: 'GITHUB ANSWERED',
      text: 'Permission to example/notifier.git denied to octocat.',
    }}
    next="Ask the owner for write access, or sign in as another account. Then check again."
  />
);

describe('ErrorDetails', () => {
  it('should say what happened, what the tool said and what to do', () => {
    expect(drawnAt(REFUSED, PANEL_COLUMNS)).toMatchSnapshot();
  });

  it('should leave out what the tool did not say', () => {
    const drawn = drawnAt(
      <ErrorDetails
        look={FILE_STATE.unmeasured}
        headline="NOT MEASURED"
        next="Fix the syntax error, then scan again."
      />,
      PANEL_COLUMNS,
    );

    expect(drawn).toBe(
      [
        '! NOT MEASURED',
        '',
        `WHAT TO DO ${'─'.repeat(PANEL_COLUMNS - 'WHAT TO DO '.length)}`,
        'Fix the syntax error, then scan again.',
      ].join('\n'),
    );
  });

  describe('when the headline does not fit beside the code', () => {
    it('should wrap the headline and keep the code whole', () => {
      const drawn = drawnAt(
        <ErrorDetails
          look={IMPROVEMENT_STATUS.failed}
          headline="The health of the service could not be read"
          code="ContractMismatchError"
          next="Ask again."
        />,
        40,
      );

      expect(drawn.split('\n').slice(0, 2)).toEqual([
        '✕ The health of    ContractMismatchError',
        'the service could',
      ]);
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(drawnAt(REFUSED, columns))).toBeLessThanOrEqual(columns);
  });
});
