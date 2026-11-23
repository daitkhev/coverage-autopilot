import { describe, expect, it } from 'vitest';

import { AccessSteps } from '#components/access-steps';
import {
  ACCESS_PASSED,
  ACCESS_REFUSED,
} from '#tests/support/sample-repositories';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

describe('AccessSteps', () => {
  it('should draw the steps that passed on one line', () => {
    expect(
      drawnAt(<AccessSteps steps={ACCESS_PASSED.steps} />, USUAL_COLUMNS),
    ).toBe('✓ git installed · ✓ gh signed in · ✓ push access');
  });

  describe('when a step failed and stopped the rest', () => {
    it('should say both in words, also without colour', () => {
      expect(
        drawnAt(
          drawnWith(
            { colour: false },
            <AccessSteps steps={ACCESS_REFUSED.steps} />,
          ),
          USUAL_COLUMNS,
        ),
      ).toBe(
        '✓ git installed · ✕ gh signed in failed · – push access not checked',
      );
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(
      widestLine(
        drawnAt(<AccessSteps steps={ACCESS_REFUSED.steps} />, columns),
      ),
    ).toBeLessThanOrEqual(columns);
  });
});
