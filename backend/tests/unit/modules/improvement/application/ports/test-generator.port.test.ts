import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type GenerationLimits,
  type GenerationReport,
  type GenerationRequest,
  type GenerationResult,
  type GenerationTarget,
  type MutantHint,
  type RejectionFeedback,
  type SubscriptionWindows,
  TEST_GENERATOR,
  type TestGenerator,
} from '#improvement/application/ports/test-generator.port';
import type { Instant } from '#kernel/time/instant';
import { SANDBOX } from '#ports/sandbox.port';

describe('TestGenerator', () => {
  it('should be injected by a token of its own', () => {
    expect(TEST_GENERATOR.description).toBe('TestGenerator');
    expect(TEST_GENERATOR).not.toBe(SANDBOX);
  });

  it('should take one request object and a signal that stops the call', () => {
    expectTypeOf<TestGenerator['generate']>()
      .parameter(0)
      .toEqualTypeOf<GenerationRequest>();
    expectTypeOf<TestGenerator['generate']>()
      .parameter(1)
      .toEqualTypeOf<AbortSignal>();
  });

  it('should answer every way a call can end with a value', () => {
    expectTypeOf<GenerationResult['outcome']>().toEqualTypeOf<
      | 'generated'
      | 'no_changes'
      | 'limit_reached'
      | 'window_exhausted'
      | 'quota_exhausted'
      | 'credential_exposed'
    >();
  });

  it('should report the tokens of every outcome', () => {
    expectTypeOf<GenerationResult>().toExtend<GenerationReport>();
    expectTypeOf<GenerationReport['tokensUsed']>().toEqualTypeOf<number>();
    expectTypeOf<
      GenerationReport['windows']
    >().toEqualTypeOf<SubscriptionWindows | null>();
  });

  it('should say when a spent window opens again', () => {
    type Waiting = Extract<GenerationResult, { outcome: 'window_exhausted' }>;

    expectTypeOf<Waiting['resumesAt']>().toEqualTypeOf<Instant | null>();
  });

  it('should have no limit of cost under a subscription', () => {
    expectTypeOf<GenerationLimits['maxCostUsd']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<
      GenerationRequest['limits']
    >().toEqualTypeOf<GenerationLimits>();
  });

  it('should aim the generator at what no test reaches', () => {
    expectTypeOf<
      GenerationRequest['target']
    >().toEqualTypeOf<GenerationTarget>();
    expectTypeOf<GenerationTarget['undetectedMutants']>().toEqualTypeOf<
      readonly MutantHint[]
    >();
    expectTypeOf<
      GenerationRequest['feedback']
    >().toEqualTypeOf<RejectionFeedback | null>();
  });
});
