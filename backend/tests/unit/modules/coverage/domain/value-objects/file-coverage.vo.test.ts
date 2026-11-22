import { describe, expect, it } from 'vitest';

import { InvalidFileCoverageError } from '#coverage/domain/errors/invalid-file-coverage.error';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';
import { FilePath } from '#kernel/primitives/file-path';
import {
  countersOf,
  measuredFile,
  TEST_THRESHOLD as threshold,
} from '#tests/support/coverage-snapshots';

describe('FileCoverage', () => {
  describe('measured', () => {
    it('should keep the counters and what never ran', () => {
      const uncovered = UncoveredCode.create({
        lines: [{ start: 6, end: 8 }],
        branchLines: [6],
        functions: [{ name: 'halve', line: 5 }],
      });
      const file = FileCoverage.measured({
        path: FilePath.create('src/used.ts'),
        counters: countersOf({ lines: [2, 5] }),
        uncovered,
      });

      expect(file.state).toBe('measured');
      expect(file.path.value).toBe('src/used.ts');
      expect(file.counters.of('lines').total).toBe(5);
      expect(file.uncovered).toBe(uncovered);
    });

    describe('when every counter is zero of zero', () => {
      it('should throw InvalidFileCoverageError', () => {
        expect(() => measuredFile('src/types.ts', {})).toThrow(
          new InvalidFileCoverageError(
            'src/types.ts has zero of zero in every counter, so it was not ' +
              'measured.',
          ),
        );
      });
    });
  });

  describe('noExecutableCode', () => {
    it('should keep every counter at zero and list nothing', () => {
      const file = FileCoverage.noExecutableCode(FilePath.create('src/t.ts'));

      expect(file.state).toBe('no_executable_code');
      expect(file.counters.equals(CoverageCounters.none())).toBe(true);
      expect(file.uncovered.equals(UncoveredCode.none())).toBe(true);
    });
  });

  describe('canBeTarget', () => {
    it('should hold for a measured file below the threshold', () => {
      expect(
        measuredFile('src/a.ts', { lines: [79, 100] }).canBeTarget(threshold),
      ).toBe(true);
    });

    it('should not hold for a measured file at the threshold', () => {
      expect(
        measuredFile('src/a.ts', { lines: [4, 5] }).canBeTarget(threshold),
      ).toBe(false);
    });

    it('should not hold for a measured file with no lines to count', () => {
      expect(
        measuredFile('src/a.ts', { functions: [0, 1] }).canBeTarget(threshold),
      ).toBe(false);
    });

    it('should never hold for a file of declarations alone', () => {
      const file = FileCoverage.noExecutableCode(FilePath.create('src/t.ts'));

      expect(
        file.canBeTarget(
          CoverageThreshold.create({ metric: 'lines', percentage: 100 }),
        ),
      ).toBe(false);
    });
  });

  describe('InvalidFileCoverageError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidFileCoverageError('x')).toMatchObject({
        code: 'invalid_file_coverage',
        retryable: false,
      });
    });
  });
});
