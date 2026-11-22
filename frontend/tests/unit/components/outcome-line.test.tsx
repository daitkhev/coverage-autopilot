import { describe, expect, it } from 'vitest';

import { BusyLine, FaultLine, RefusalLine } from '#components/outcome-line';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const REFUSAL = {
  error: 'not_found',
  message: 'No improvement has this id.',
} as const;

describe('BusyLine', () => {
  it('should say what runs after a spinner', () => {
    expect(
      drawnAt(<BusyLine doing="Sending your decision" />, USUAL_COLUMNS),
    ).toMatch(/^. Sending your decision$/u);
  });
});

describe('RefusalLine', () => {
  it('should give the sentence first and the code beside it', () => {
    expect(drawnAt(<RefusalLine error={REFUSAL} />, USUAL_COLUMNS)).toBe(
      '! No improvement has this id.  not_found',
    );
  });

  it.each(WIDTHS)('should fit a long sentence in %i columns', (columns) => {
    const drawn = drawnAt(
      <RefusalLine error={{ ...REFUSAL, message: 'word '.repeat(60) }} />,
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});

describe('FaultLine', () => {
  it('should mark a request nothing answered as failed', () => {
    expect(
      drawnAt(
        <FaultLine sentence="Nothing answered the cancel: socket closed" />,
        USUAL_COLUMNS,
      ),
    ).toBe('✕ Nothing answered the cancel: socket closed');
  });
});
