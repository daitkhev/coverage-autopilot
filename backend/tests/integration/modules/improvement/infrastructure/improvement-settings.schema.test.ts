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

  describe('when no credential of the generator is set', () => {
    it('should let the settings pass, as scans need none', () => {
      expect(() => {
        checkImprovementSettings(TEST_SETTINGS, {
          ...GENERATOR_TEST_SETTINGS,
          credential: { variable: 'ANTHROPIC_API_KEY', value: null },
        });
      }).not.toThrow();
    });

    it('should still refuse a variable that cannot be one', () => {
      expect(() => {
        checkImprovementSettings(TEST_SETTINGS, {
          ...GENERATOR_TEST_SETTINGS,
          credential: { variable: 'a token', value: null },
        });
      }).toThrow(
        new InvalidImprovementSettingsError(
          'The settings of an improvement cannot work. ' +
            'generator.credential.variable: invalid_format.',
        ),
      );
    });
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
