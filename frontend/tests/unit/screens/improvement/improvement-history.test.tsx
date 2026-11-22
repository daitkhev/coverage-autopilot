import { describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { History } from '#screens/improvement/improvement-history';
import { SAMPLE_NOW } from '#tests/support/fake-service-api';
import { REJECTED_ATTEMPT } from '#tests/support/sample-attempts';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { drawnAt, USUAL_COLUMNS } from '#tests/support/terminal-text';

const { verifying, generating } = IMPROVEMENT_BY_STATUS;

function history(improvement: Improvement): string {
  return drawnAt(
    <History
      improvement={improvement}
      now={SAMPLE_NOW}
      timeZone="UTC"
      focused
    />,
    USUAL_COLUMNS,
  );
}

describe('History', () => {
  describe('when the patch waits for a person', () => {
    it('should say so on the last step', () => {
      expect(history({ ...verifying, mode: 'review' })).toContain(
        '○ Publishing  waits for your approval',
      );
    });
  });

  describe('when the file has no branches and the gate counted no mutants', () => {
    it('should say what it measured, and nothing of mutants', () => {
      const attempt = {
        ...REJECTED_ATTEMPT,
        report: REJECTED_ATTEMPT.report && {
          ...REJECTED_ATTEMPT.report,
          mutants: null,
          coverageBefore: REJECTED_ATTEMPT.report.coverageBefore && {
            ...REJECTED_ATTEMPT.report.coverageBefore,
            branches: { covered: 0, total: 0, percentage: null },
          },
        },
      };

      const drawn = history({ ...generating, attempts: [attempt] });

      expect(drawn).toContain('└ lines 41.2% · no branches');
      expect(drawn).not.toContain('no test detects');
    });
  });

  describe('when a repeated check has finished', () => {
    it('should say how many runs it took', () => {
      const progress = {
        updatedAt: SAMPLE_NOW,
        steps: [
          {
            code: 'repeated_runs',
            status: 'passed',
            done: 3,
            total: 3,
          } as const,
        ],
      };

      expect(history({ ...verifying, progress })).toContain('3 of 3 runs');
    });
  });

  describe('when an attempt runs in a status that names no work', () => {
    it('should draw the attempt without a note', () => {
      const drawn = history({ ...generating, status: 'publishing' });

      expect(drawn).toMatch(/⠋ Attempt 2 +\d+m \d+s/u);
    });
  });
});
