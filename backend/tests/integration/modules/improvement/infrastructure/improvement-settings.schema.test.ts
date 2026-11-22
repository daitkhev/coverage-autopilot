import { describe, expect, it } from 'vitest';

import { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';
import { InvalidImprovementSettingsError } from '#improvement/infrastructure/errors/invalid-improvement-settings.error';
import { checkImprovementSettings } from '#improvement/infrastructure/improvement-settings.schema';
import { GENERATOR_TEST_SETTINGS } from '#tests/support/generator-request';
import { TEST_SETTINGS } from '#tests/support/improvement-values';

describe('checkImprovementSettings', () => {
  it('should let settings that can work pass', () => {
    expect(() => {
      checkImprovementSettings(TEST_SETTINGS, GENERATOR_TEST_SETTINGS);
    }).not.toThrow();
  });

  describe('when the default policy is one the gate refuses', () => {
    it('should refuse to start, as every request without a policy would fail', () => {
      const policy = QualityPolicy.create({
        requiredChecks: ['type_check', 'new_tests_pass'],
        repeatedRuns: 3,
        mutationThreshold: 60,
      });

      expect(() => {
        checkImprovementSettings(
          { ...TEST_SETTINGS, policy },
          GENERATOR_TEST_SETTINGS,
        );
      }).toThrow(
        new InvalidImprovementSettingsError(
          'The settings of an improvement cannot work. ' +
            'policy.requiredChecks: unusable.',
        ),
      );
    });
  });
});
