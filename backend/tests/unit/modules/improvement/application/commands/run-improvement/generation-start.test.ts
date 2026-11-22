import { describe, expect, it } from 'vitest';

import {
  failWithoutSnapshot,
  openAttemptWithinBudget,
} from '#improvement/application/commands/run-improvement/generation-start';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  improvementIn,
  type JourneySpec,
} from '#tests/support/improvement-journeys';
import {
  budgetOf,
  minutesIn,
  reportOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';

const NOW = minutesIn(10);

/** A generating improvement whose first patch the gate rejected. */
function rejectedOnce(spec: JourneySpec): Improvement {
  const improvement = improvementIn('verifying', spec);
  improvement.recordVerdict(reportOf('rejected'), minutesIn(6));
  return improvement;
}

describe('the start of a generation', () => {
  describe('openAttemptWithinBudget', () => {
    it('should open an attempt while the budget allows one', () => {
      const improvement = rejectedOnce({});

      openAttemptWithinBudget(improvement, NOW);

      expect(improvement.currentAttempt?.number).toBe(2);
      expect(improvement.currentAttempt?.startedAt).toEqual(NOW);
      expect(improvement.status).toBe('generating');
    });

    describe('when the budget allows no new attempt', () => {
      it('should fail the improvement, naming the limit that is spent', () => {
        const improvement = rejectedOnce({ budget: budgetOf({ attempts: 1 }) });

        openAttemptWithinBudget(improvement, NOW);

        expect(improvement.status).toBe('failed');
        expect(improvement.phaseStartedAt).toEqual(NOW);
        expect(improvement.attempts).toHaveLength(1);
        expect(improvement.failure?.reason).toBe('budget_exhausted');
        expect(improvement.failure?.message).toBe(
          'The limit of attempts of the budget (1) is spent, so no new ' +
            'attempt opens.',
        );
      });

      it('should name tokens and minutes the same way', () => {
        const tokens = rejectedOnce({
          billing: 'api_key',
          budget: budgetOf({ tokens: 1000 }),
        });
        const minutes = improvementIn('generating');

        openAttemptWithinBudget(tokens, NOW);
        openAttemptWithinBudget(minutes, minutesIn(31));

        expect(tokens.failure?.message).toContain('limit of tokens');
        expect(tokens.failure?.message).toContain('(1000)');
        expect(minutes.failure?.message).toContain('limit of minutes');
        expect(minutes.failure?.message).toContain('(30)');
      });
    });
  });

  describe('failWithoutSnapshot', () => {
    it('should fail the improvement as stale, naming its file', () => {
      const improvement = improvementIn('generating');

      failWithoutSnapshot(improvement, NOW);

      expect(improvement.status).toBe('failed');
      expect(improvement.failure?.reason).toBe('stale_snapshot');
      expect(improvement.failure?.message).toContain(
        `The fresh snapshot of ${TARGET_FILE} is not stored any more`,
      );
    });
  });
});
