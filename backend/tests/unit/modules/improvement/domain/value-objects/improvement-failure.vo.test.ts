import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  FAILURE_REASONS,
  type FailureReason,
  ImprovementFailure,
  isSentence,
} from '#improvement/domain/value-objects/improvement-failure.vo';

describe('ImprovementFailure', () => {
  it('should know the reasons of the contract', () => {
    expect(FAILURE_REASONS).toEqual([
      'budget_exhausted',
      'stale_snapshot',
      'verification_error',
      'retries_exhausted',
      'existing_tests_fail',
      'mutation_unsupported',
      'quota_exhausted',
      'credential_exposed',
      'generator_unavailable',
      'publish_failed',
    ]);
  });

  describe('create', () => {
    it('should keep the reason and the sentence', () => {
      const failure = ImprovementFailure.create({
        reason: 'budget_exhausted',
        message: 'Every attempt was spent.',
      });

      expect(failure.reason).toBe('budget_exhausted');
      expect(failure.message).toBe('Every attempt was spent.');
    });

    describe('when the reason is unknown or the sentence is blank', () => {
      it.each([
        ['timeout', 'It took too long.'],
        ['budget_exhausted', '  '],
      ])(
        'should throw InvalidImprovementValueError for %s',
        (reason, message) => {
          expect(() =>
            ImprovementFailure.create({
              reason: reason as FailureReason,
              message,
            }),
          ).toThrow(
            new InvalidImprovementValueError(
              `"${reason}" with "${message}" is not a failure: a known reason ` +
                'and a sentence.',
            ),
          );
        },
      );
    });
  });
});

describe('isSentence', () => {
  it('should take a text a person can read and the contract can send', () => {
    expect(isSentence('The file changed.')).toBe(true);
    expect(isSentence('x'.repeat(8192))).toBe(true);
  });

  it.each(['', ' \n', 'x'.repeat(8193)])('should refuse "%s"', (text) => {
    expect(isSentence(text)).toBe(false);
  });
});
