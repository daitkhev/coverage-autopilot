import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type GenerationCallLimits,
  IMPROVEMENT_SETTINGS,
  type ImprovementSettings,
} from '#improvement/application/improvement-settings';
import { TEST_GENERATOR } from '#improvement/application/ports/test-generator.port';
import type { BudgetSettings } from '#improvement/domain/value-objects/budget-settings.vo';
import type { GeneratorConfig } from '#improvement/domain/value-objects/generator-config.vo';
import type { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';

describe('ImprovementSettings', () => {
  it('should be injected by a token of its own', () => {
    expect(IMPROVEMENT_SETTINGS.description).toBe('ImprovementSettings');
    expect(IMPROVEMENT_SETTINGS).not.toBe(TEST_GENERATOR);
  });

  it('should fill a request with values the domain has checked', () => {
    expectTypeOf<
      ImprovementSettings['budget']
    >().toEqualTypeOf<BudgetSettings>();
    expectTypeOf<
      ImprovementSettings['policy']
    >().toEqualTypeOf<QualityPolicy>();
    expectTypeOf<
      ImprovementSettings['generator']
    >().toEqualTypeOf<GeneratorConfig>();
    expectTypeOf<ImprovementSettings['mode']>().toEqualTypeOf<
      'automatic' | 'review'
    >();
  });

  it('should limit one call of the generator, with no price under a subscription', () => {
    expectTypeOf<
      ImprovementSettings['generation']
    >().toEqualTypeOf<GenerationCallLimits>();
    expectTypeOf<GenerationCallLimits['maxCostUsd']>().toEqualTypeOf<
      number | null
    >();
  });
});
