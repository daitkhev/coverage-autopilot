import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { BranchName } from '#improvement/domain/value-objects/branch-name.vo';
import {
  IMPROVEMENT_ID,
  improvementIdOf,
} from '#tests/support/improvement-values';

const BRANCH = `coverage-autopilot/${IMPROVEMENT_ID}`;

describe('BranchName', () => {
  describe('of', () => {
    it('should follow from the id of the improvement alone', () => {
      expect(BranchName.of(improvementIdOf()).value).toBe(BRANCH);
    });
  });

  describe('parse', () => {
    it('should give back the branch its improvement would get', () => {
      expect(BranchName.parse(BRANCH, improvementIdOf())).toEqual(
        BranchName.of(improvementIdOf()),
      );
    });

    describe('when the name is not the branch of the improvement', () => {
      it.each(['main', `coverage-autopilot/${'0'.repeat(36)}`])(
        'should throw InvalidImprovementValueError for "%s"',
        (name) => {
          expect(() => BranchName.parse(name, improvementIdOf())).toThrow(
            new InvalidImprovementValueError(
              `"${name}" is not the branch of the improvement ${IMPROVEMENT_ID}.`,
            ),
          );
        },
      );
    });
  });
});
