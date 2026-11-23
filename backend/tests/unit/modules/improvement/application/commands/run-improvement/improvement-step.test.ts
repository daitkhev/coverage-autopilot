import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import {
  IMPROVEMENT_STEPS,
  type ImprovementStep,
  type StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import { IMPROVEMENT_SETTINGS } from '#improvement/application/improvement-settings';
import type { FailureReason } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';

describe('ImprovementStep', () => {
  it('should be listed under a token of its own', () => {
    expect(IMPROVEMENT_STEPS.description).toBe('ImprovementSteps');
    expect(IMPROVEMENT_STEPS).not.toBe(IMPROVEMENT_SETTINGS);
  });

  it('should name the status it works on and why a fault fails it', () => {
    expectTypeOf<
      ImprovementStep['status']
    >().toEqualTypeOf<ImprovementStatus>();
    expectTypeOf<
      ImprovementStep['faultReason']
    >().toEqualTypeOf<FailureReason>();
  });

  it('should take the run and end in a value', () => {
    expectTypeOf<ImprovementStep['run']>()
      .parameter(0)
      .toEqualTypeOf<ImprovementRun>();
    expectTypeOf<
      ImprovementStep['run']
    >().returns.resolves.toEqualTypeOf<StepResult>();
    expectTypeOf<StepResult['next']>().toEqualTypeOf<'continue' | 'retry'>();
  });
});
