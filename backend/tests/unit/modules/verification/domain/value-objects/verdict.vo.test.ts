import { describe, expect, it } from 'vitest';

import { Verdict } from '#verification/domain/value-objects/verdict.vo';

describe('Verdict', () => {
  it('should accept with no reason', () => {
    const verdict = Verdict.accepted();

    expect(verdict.value).toBe('accepted');
    expect(verdict.reasons).toEqual([]);
  });

  it('should keep its own copy of the reasons', () => {
    const reasons = ['The new tests fail.'];

    const verdict = Verdict.rejected(reasons);
    reasons.push('Another.');

    expect(verdict.value).toBe('rejected');
    expect(verdict.reasons).toEqual(['The new tests fail.']);
  });

  it('should be equal to a verdict with the same reasons', () => {
    expect(
      Verdict.inconclusive(['Out of time.']).equals(
        Verdict.inconclusive(['Out of time.']),
      ),
    ).toBe(true);
    expect(
      Verdict.inconclusive(['Out of time.']).equals(
        Verdict.rejected(['Out of time.']),
      ),
    ).toBe(false);
  });
});
