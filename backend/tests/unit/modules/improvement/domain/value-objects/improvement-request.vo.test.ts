import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  IMPROVEMENT_MODES,
  type ImprovementMode,
} from '#improvement/domain/value-objects/improvement-mode.vo';
import {
  BASE_COMMIT,
  budgetOf,
  generatorOf,
  hashOf,
  policyOf,
  REPOSITORY_ID,
  requestOf,
  type RequestSpec,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';

describe('ImprovementMode', () => {
  it('should know the modes of the contract', () => {
    expect(IMPROVEMENT_MODES).toEqual(['automatic', 'review']);
  });
});

describe('ImprovementRequest', () => {
  describe('create', () => {
    it('should keep what was asked, as it was asked', () => {
      const request = requestOf({ mode: 'review' });

      expect([
        request.repositoryId.value,
        request.sourceSnapshotId.value,
        request.baseCommit.value,
        request.targetFile.value,
        request.mode,
        request.key.value,
        request.fingerprint.value,
      ]).toEqual([
        REPOSITORY_ID,
        SOURCE_SNAPSHOT_ID,
        BASE_COMMIT,
        TARGET_FILE,
        'review',
        'request-1',
        hashOf('f'),
      ]);
      expect(request.policy).toEqual(policyOf());
      expect(request.generator).toEqual(generatorOf());
      expect(request.budget).toEqual(budgetOf());
    });

    it('should keep a limit of tokens for a generator paid by a key', () => {
      const request = requestOf({
        billing: 'api_key',
        budget: budgetOf({ tokens: 200_000 }),
      });

      expect(request.budget.tokens).toBe(200_000);
    });

    describe('when the limit of tokens does not fit the billing or the mode is unknown', () => {
      it.each<[RequestSpec, string]>([
        [{ billing: 'api_key' }, 'automatic mode paid by api_key'],
        [
          { budget: budgetOf({ tokens: 10 }) },
          'automatic mode paid by subscription',
        ],
        [
          { mode: 'manual' as ImprovementMode },
          'manual mode paid by subscription',
        ],
      ])('should throw InvalidImprovementValueError for %o', (spec, said) => {
        const tokens = spec.budget?.tokens ?? null;

        expect(() => requestOf(spec)).toThrow(
          new InvalidImprovementValueError(
            `An improvement in ${said} cannot have a limit of ` +
              `${String(tokens)} tokens: a known mode, and a limit of ` +
              'tokens with a key only.',
          ),
        );
      });
    });
  });
});
