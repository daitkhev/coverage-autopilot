import { describe, expect, it } from 'vitest';

import { InvalidScanParametersError } from '#coverage/domain/errors/invalid-scan-parameters.error';
import { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import { jestProject } from '#tests/support/coverage-snapshots';

describe('DetectedProject', () => {
  describe('create', () => {
    it('should keep the runner, its version, the manager and the config', () => {
      const project = jestProject();

      expect(project.testRunner).toBe('jest');
      expect(project.testRunnerVersion).toBe('30.5.2');
      expect(project.packageManager).toBe('npm');
      expect(project.configFile?.value).toBe('jest.config.json');
    });

    describe('when the version is empty', () => {
      it('should throw InvalidScanParametersError', () => {
        expect(() =>
          DetectedProject.create({
            testRunner: 'vitest',
            testRunnerVersion: '',
            packageManager: 'npm',
            configFile: null,
          }),
        ).toThrow(
          new InvalidScanParametersError('The version of vitest is empty.'),
        );
      });
    });
  });

  describe('InvalidScanParametersError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidScanParametersError('x')).toMatchObject({
        code: 'invalid_scan_parameters',
        retryable: false,
      });
    });
  });
});
