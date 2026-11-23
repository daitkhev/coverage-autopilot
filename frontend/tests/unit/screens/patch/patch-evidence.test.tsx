import { describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { Evidence } from '#screens/patch/patch-evidence';
import { ACCEPTED_ATTEMPT } from '#tests/support/sample-attempts';
import {
  IMPROVEMENT_BY_STATUS,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import { drawnAt, USUAL_COLUMNS } from '#tests/support/terminal-text';

const WAITING = IMPROVEMENT_BY_STATUS.awaiting_approval;

function evidence(
  improvement: Improvement,
  threshold: { readonly percentage?: number },
): string {
  return drawnAt(
    <Evidence
      improvement={improvement}
      patch={PATCH_AWAITING_APPROVAL}
      threshold={threshold.percentage}
      focused
    />,
    USUAL_COLUMNS,
  );
}

describe('Evidence', () => {
  describe('when the attempt of the patch has no report', () => {
    it('should say so', () => {
      const drawn = evidence({ ...WAITING, attempts: [] }, {});

      expect(drawn).toContain('The gate wrote no report for this patch.');
    });
  });

  describe('when the gate measured nothing and timed nothing', () => {
    it('should show the verdict and the checks alone', () => {
      const report = ACCEPTED_ATTEMPT.report && {
        ...ACCEPTED_ATTEMPT.report,
        coverageBefore: null,
        coverageAfter: null,
        mutants: null,
        checks: ACCEPTED_ATTEMPT.report.checks.map((check) => ({
          ...check,
          durationMs: null,
        })),
      };
      const improvement = {
        ...WAITING,
        attempts: [{ ...ACCEPTED_ATTEMPT, report }],
      };

      const drawn = evidence(improvement, { percentage: 80 });

      expect(drawn).toContain('✓ ACCEPTED');
      expect(drawn).not.toContain('COVERAGE OF THE FILE');
      expect(drawn).not.toContain('MUTANTS');
      expect(drawn).toMatch(/✓ mutants detected +│/u);
    });
  });

  describe('when the repository has no threshold', () => {
    it('should leave the coverage out', () => {
      const drawn = evidence(WAITING, {});

      expect(drawn).not.toContain('COVERAGE OF THE FILE');
      expect(drawn).toContain('11 of 14 now detected by the new tests');
    });
  });
});
