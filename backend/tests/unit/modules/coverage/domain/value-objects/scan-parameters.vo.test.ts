import { describe, expect, it } from 'vitest';

import { InvalidScanParametersError } from '#coverage/domain/errors/invalid-scan-parameters.error';
import { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import { jestParameters } from '#tests/support/coverage-snapshots';

describe('ScanParameters', () => {
  describe('create', () => {
    it('should keep the tools a snapshot was measured with', () => {
      expect(jestParameters()).toMatchObject({
        testRunner: 'jest',
        testRunnerVersion: '30.5.2',
        coverageProvider: 'babel',
        fileListRule: 'default-sources-v1',
      });
    });

    describe('when a word is empty', () => {
      it('should throw InvalidScanParametersError that names it', () => {
        expect(() =>
          ScanParameters.create({
            testRunner: 'vitest',
            testRunnerVersion: '',
            coverageProvider: '',
            fileListRule: 'default-sources-v1',
          }),
        ).toThrow(
          new InvalidScanParametersError(
            'The scan parameters have an empty testRunnerVersion and ' +
              'coverageProvider.',
          ),
        );
      });
    });
  });

  describe('equals', () => {
    it('should tell measurements with another provider apart', () => {
      const v8 = ScanParameters.create({
        testRunner: 'jest',
        testRunnerVersion: '30.5.2',
        coverageProvider: 'v8',
        fileListRule: 'default-sources-v1',
      });

      expect(jestParameters().equals(jestParameters())).toBe(true);
      expect(jestParameters().equals(v8)).toBe(false);
    });
  });
});
