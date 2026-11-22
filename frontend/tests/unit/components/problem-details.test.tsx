import { describe, expect, it } from 'vitest';

import { ProblemDetails } from '#components/problem-details';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const NEXT = 'The screen asks again every second.';

describe('ProblemDetails', () => {
  it('should say what the service refused with and its code', () => {
    expect(
      drawnAt(
        <ProblemDetails
          headline="The list could not be read"
          refusal={{
            error: 'internal_error',
            message: 'The service failed to answer.',
          }}
          fault={undefined}
          next={NEXT}
        />,
        USUAL_COLUMNS,
      ),
    ).toMatchSnapshot();
  });

  it('should take a refusal over a fault', () => {
    const drawn = drawnAt(
      <ProblemDetails
        headline="Not connected"
        refusal={{ error: 'not_found', message: 'No such repository.' }}
        fault={new Error('socket closed')}
        next={NEXT}
      />,
      USUAL_COLUMNS,
    );

    expect(drawn).toContain('No such repository.');
    expect(drawn).not.toContain('socket closed');
  });

  describe('when a request threw', () => {
    it('should say what the client said, with the name of the fault', () => {
      const fault = new TypeError('The answer does not match its schema.');
      const drawn = drawnAt(
        <ProblemDetails
          headline="The list could not be read"
          refusal={undefined}
          fault={fault}
          next={NEXT}
        />,
        USUAL_COLUMNS,
      );

      expect(drawn).toContain('✕ The list could not be read  TypeError');
      expect(drawn).toContain('THE CLIENT SAID');
      expect(drawn).toContain('The answer does not match its schema.');
    });

    it('should say a fault that is not an error as text', () => {
      const drawn = drawnAt(
        <ProblemDetails
          headline="Not connected"
          refusal={undefined}
          fault="the socket closed"
          next={NEXT}
        />,
        USUAL_COLUMNS,
      );

      expect(drawn).toContain('✕ Not connected  fault');
      expect(drawn).toContain('the socket closed');
    });
  });

  describe('when nothing went wrong', () => {
    it('should draw nothing', () => {
      expect(
        drawnAt(
          <ProblemDetails
            headline="Not connected"
            refusal={undefined}
            fault={undefined}
            next={NEXT}
          />,
          USUAL_COLUMNS,
        ),
      ).toBe('');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = drawnAt(
      <ProblemDetails
        headline="The list could not be read"
        refusal={undefined}
        fault={new Error('x'.repeat(200))}
        next={NEXT}
      />,
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
