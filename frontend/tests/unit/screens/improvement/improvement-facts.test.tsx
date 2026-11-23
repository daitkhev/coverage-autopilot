import { describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { Facts } from '#screens/improvement/improvement-facts';
import { REJECTED_ATTEMPT } from '#tests/support/sample-attempts';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { SCANNED_REPOSITORY } from '#tests/support/sample-repositories';
import { drawnAt, USUAL_COLUMNS } from '#tests/support/terminal-text';

const THRESHOLD = 80;

const { verifying, completed } = IMPROVEMENT_BY_STATUS;

function facts(
  improvement: Improvement,
  { threshold }: { readonly threshold?: number } = { threshold: THRESHOLD },
): string {
  return drawnAt(
    <Facts
      improvement={improvement}
      repository={SCANNED_REPOSITORY}
      threshold={threshold}
      focused={false}
    />,
    USUAL_COLUMNS,
  );
}

describe('Facts', () => {
  describe('when the generator is paid by the token', () => {
    it('should show the tokens as a limit in use', () => {
      const paid = {
        ...verifying,
        budget: { ...verifying.budget, tokens: 200_000 },
      };

      expect(facts(paid)).toMatch(/Tokens +━+─+ {2}93k of 200k/u);
    });
  });

  describe('when the work completed with no branch and no accepted attempt', () => {
    it('should say that there is none', () => {
      const drawn = facts({ ...completed, branch: null, attempts: [] });

      expect(drawn).toMatch(/Branch +none/u);
      expect(drawn).toMatch(/Patch +none/u);
    });
  });

  describe('when the repository has no threshold', () => {
    it('should leave the coverage of the file out', () => {
      const drawn = facts(verifying, {});

      expect(drawn).toContain('TARGET');
      expect(drawn).not.toContain('Lines');
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

      const drawn = facts({ ...verifying, attempts: [attempt] });

      expect(drawn).toContain('Lines');
      expect(drawn).not.toContain('Mutants');
    });
  });
});
