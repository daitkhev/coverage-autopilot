import { describe, expect, it } from 'vitest';

import type {
  Attempt,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { ImprovementSummary } from '#screens/improvements/improvement-summary';
import { SAMPLE_NOW } from '#tests/support/fake-service-api';
import { REJECTED_ATTEMPT } from '#tests/support/sample-attempts';
import { INVOICE_COVERAGE } from '#tests/support/sample-files';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { drawnAt, widestLine, WIDTHS } from '#tests/support/terminal-text';

const PANEL_COLUMNS = 40;

function reportOf(attempt: Attempt): VerificationReport {
  if (attempt.report === null) {
    throw new Error('The sample attempt was judged, so it has a report.');
  }
  return attempt.report;
}

function draw(improvement: Improvement, columns = PANEL_COLUMNS): string {
  return drawnAt(
    <ImprovementSummary
      improvement={improvement}
      moment={{ now: SAMPLE_NOW, timeZone: 'UTC' }}
    />,
    columns,
  );
}

describe('ImprovementSummary', () => {
  it('should say what a finished improvement did, and how long ago', () => {
    expect(draw(IMPROVEMENT_BY_STATUS.completed)).toMatchSnapshot();
  });

  describe('when no attempt was made', () => {
    it('should name no attempt and no patch', () => {
      const drawn = draw(IMPROVEMENT_BY_STATUS.created);

      expect(drawn.split('\n')[0]).toBe('○ WAIT');
      expect(drawn).not.toContain('ATTEMPT');
      expect(drawn).toContain('waiting for 30s');
    });
  });

  describe('when the last attempt has no patch yet', () => {
    it('should name the attempt alone', () => {
      expect(draw(IMPROVEMENT_BY_STATUS.generating).split('\n')[0]).toBe(
        '⠋ RUN  attempt 2',
      );
    });
  });

  describe('when the gate stopped before it measured', () => {
    it('should show the verdict and no numbers', () => {
      const drawn = draw({
        ...IMPROVEMENT_BY_STATUS.failed,
        attempts: [
          {
            ...REJECTED_ATTEMPT,
            report: {
              ...reportOf(REJECTED_ATTEMPT),
              coverageAfter: null,
              mutants: null,
            },
          },
        ],
      });

      expect(drawn).toContain('✕ rejected');
      expect(drawn).not.toContain('Lines');
      expect(drawn).not.toContain('Mutants');
    });

    it('should show no percentage the service did not send', () => {
      const report = reportOf(REJECTED_ATTEMPT);
      const drawn = draw({
        ...IMPROVEMENT_BY_STATUS.failed,
        attempts: [
          {
            ...REJECTED_ATTEMPT,
            report: {
              ...report,
              coverageBefore: null,
              coverageAfter: {
                ...INVOICE_COVERAGE,
                lines: { covered: 0, total: 0, percentage: null },
              },
            },
          },
        ],
      });

      expect(drawn).not.toContain('Lines');
      expect(drawn).toContain('Mutants');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(
      widestLine(draw(IMPROVEMENT_BY_STATUS.awaiting_approval, columns)),
    ).toBeLessThanOrEqual(columns);
  });
});
