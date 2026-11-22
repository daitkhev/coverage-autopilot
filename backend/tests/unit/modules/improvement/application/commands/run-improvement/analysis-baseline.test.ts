import { describe, expect, it } from 'vitest';

import { verificationBaselineOf } from '#improvement/application/commands/run-improvement/analysis-baseline';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { gateBaselineOf } from '#tests/support/improvement-handler-modules';
import { baselineOf, mutationOf } from '#tests/support/improvement-values';

describe('verificationBaselineOf', () => {
  it('should keep what the gate measured', () => {
    expect(verificationBaselineOf(gateBaselineOf())).toEqual(baselineOf());
  });

  it('should hold a copy of its own of the mutants', () => {
    const dto = gateBaselineOf();

    const baseline = verificationBaselineOf(dto);

    expect(baseline.mutation?.undetected).not.toBe(dto.mutation?.undetected);
    expect(baseline.mutation?.tool).not.toBe(dto.mutation?.tool);
  });

  it('should keep a baseline with no mutants as one', () => {
    const baseline = verificationBaselineOf({
      ...gateBaselineOf(),
      mutation: null,
    });

    expect(baseline.mutation).toBeNull();
  });

  describe('when the gate lists more mutants than it counted', () => {
    it('should refuse the baseline', () => {
      expect(() =>
        verificationBaselineOf({
          ...gateBaselineOf(),
          mutation: { ...mutationOf(), totalMutants: 0 },
        }),
      ).toThrow(InvalidImprovementValueError);
    });
  });
});
