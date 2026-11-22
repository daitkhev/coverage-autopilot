import { describe, expect, it } from 'vitest';

import {
  verificationBaselineDtoOf,
  verificationReportOf,
} from '#improvement/application/commands/run-improvement/verification-mapping';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  baselineOf,
  checkOf,
  reportPropsOf,
} from '#tests/support/improvement-values';
import type { VerificationReportDto } from '#verification/contracts/verification-public-api';

describe('verificationBaselineDtoOf', () => {
  it('should keep every part of the baseline', () => {
    const baseline = baselineOf({ typeCheck: 'absent' });

    const dto = verificationBaselineDtoOf(baseline);

    expect(dto).toEqual({
      commit: baseline.commit,
      targetFile: baseline.targetFile,
      typeCheck: 'absent',
      existingTests: 'passed',
      mutation: baseline.mutation,
    });
  });
});

describe('verificationReportOf', () => {
  it('should keep every part of the report', () => {
    const dto: VerificationReportDto = reportPropsOf('rejected');

    const report = verificationReportOf(dto);

    expect(report.patchHash).toBe(dto.patchHash);
    expect(report.verdict).toBe('rejected');
    expect(report.reasons).toEqual(dto.reasons);
    expect(report.checks).toEqual(dto.checks);
    expect(report.coverageBefore).toEqual(dto.coverageBefore);
    expect(report.coverageAfter).toBeNull();
    expect(report.mutants).toEqual(dto.mutants);
    expect(report.survivingMutants).toEqual(dto.survivingMutants);
  });

  describe('when the report breaks a rule of the domain', () => {
    it('should refuse it', () => {
      const dto: VerificationReportDto = {
        ...reportPropsOf('accepted'),
        checks: [checkOf('new_tests_pass', 'rejected')],
      };

      expect(() => verificationReportOf(dto)).toThrow(
        InvalidImprovementValueError,
      );
    });
  });
});
