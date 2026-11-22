import { describe, expect, it } from 'vitest';

import type { Attempt } from '@coverage-autopilot/api-contracts/attempts';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { Ending } from '#screens/improvement/improvement-ending';
import { SAMPLE_NOW } from '#tests/support/fake-service-api';
import { OPEN_ATTEMPT, REJECTED_ATTEMPT } from '#tests/support/sample-attempts';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { drawnAt, USUAL_COLUMNS } from '#tests/support/terminal-text';

const THRESHOLD = 80;

const { completed, failed, skipped, cancelled } = IMPROVEMENT_BY_STATUS;

function ending(
  improvement: Improvement,
  { threshold }: { readonly threshold?: number } = { threshold: THRESHOLD },
): string {
  return drawnAt(
    <Ending
      improvement={improvement}
      threshold={threshold}
      now={SAMPLE_NOW}
      focused
      choices={[]}
      chosen={0}
    />,
    USUAL_COLUMNS,
  );
}

/** The gate stopped before it measured the file, and asks for a rerun. */
const STOPPED: Attempt = {
  ...REJECTED_ATTEMPT,
  report: REJECTED_ATTEMPT.report && {
    ...REJECTED_ATTEMPT.report,
    verdict: 'inconclusive',
    coverageBefore: null,
    coverageAfter: null,
  },
};

/** The generator wrote nothing, so the gate had nothing to judge. */
const UNCHANGED: Attempt = {
  ...REJECTED_ATTEMPT,
  number: 2,
  generationOutcome: 'no_changes',
  report: null,
};

describe('Ending', () => {
  describe('when the service sent no reason', () => {
    it('should still name how the work ended', () => {
      expect(ending({ ...failed, failure: null })).toContain('✕ Failed');
      expect(ending({ ...skipped, skip: null })).toContain('– Skipped');
    });
  });

  describe('when the work completed without a pull request', () => {
    it('should not claim that one was opened', () => {
      const drawn = ending({ ...completed, pullRequest: null });

      expect(drawn).toContain('✓ Completed');
      expect(drawn).not.toContain('Pull request opened');
    });
  });

  describe('when the repository has no threshold', () => {
    it('should leave the coverage out', () => {
      expect(ending(completed, {})).not.toContain('BEFORE AND AFTER');
    });
  });

  describe('when no attempt was measured', () => {
    it('should say why each attempt ended, and leave the coverage out', () => {
      const drawn = ending({ ...failed, attempts: [STOPPED, UNCHANGED] });

      expect(drawn).not.toContain('BEFORE AND AFTER');
      expect(drawn).toMatch(
        /! Attempt 1 {2}runs again +the checks could not finish/u,
      );
      expect(drawn).toMatch(
        /– Attempt 2 {2}no verdict +the generator changed nothing/u,
      );
    });
  });

  describe('when the gate counted no mutants', () => {
    it('should leave the mutants out', () => {
      const attempt = {
        ...REJECTED_ATTEMPT,
        report: REJECTED_ATTEMPT.report && {
          ...REJECTED_ATTEMPT.report,
          mutants: null,
        },
      };

      const drawn = ending({ ...failed, attempts: [attempt] });

      expect(drawn).toContain('BEFORE AND AFTER ATTEMPT 1');
      expect(drawn).not.toContain('Mutants');
    });
  });

  describe('when the work was cancelled while an attempt ran', () => {
    it('should list the attempt with nothing after it', () => {
      const drawn = ending({ ...cancelled, attempts: [OPEN_ATTEMPT] });

      expect(drawn).toContain('Attempt 2  running');
    });
  });
});
