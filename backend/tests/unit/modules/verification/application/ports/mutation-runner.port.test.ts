import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type CompletedMutationRun,
  type MutantResult,
  MUTATION_RUNNER,
  type MutationRunner,
  type MutationRunRequest,
  type MutationRunResult,
  type PatchedMutationRunRequest,
  type TestReference,
} from '#verification/application/ports/mutation-runner.port';
import { VERIFICATION_PUBLIC_API } from '#verification/contracts/verification-public-api';

describe('MutationRunner', () => {
  it('should be injected by a token of its own', () => {
    expect(MUTATION_RUNNER.description).toBe('MutationRunner');
    expect(MUTATION_RUNNER).not.toBe(VERIFICATION_PUBLIC_API);
  });

  it('should measure a commit and a patched copy with the same request', () => {
    expectTypeOf<MutationRunner['measureBaseline']>()
      .parameter(0)
      .toEqualTypeOf<MutationRunRequest>();
    expectTypeOf<MutationRunner['measureWithPatch']>()
      .parameter(0)
      .toEqualTypeOf<PatchedMutationRunRequest>();
    expectTypeOf<PatchedMutationRunRequest>().toExtend<MutationRunRequest>();
  });

  it('should take a signal that stops the run', () => {
    expectTypeOf<MutationRunner['measureBaseline']>()
      .parameter(1)
      .toEqualTypeOf<AbortSignal>();
    expectTypeOf<MutationRunner['measureWithPatch']>()
      .parameter(1)
      .toEqualTypeOf<AbortSignal>();
  });

  it('should answer a project the tool cannot run on with a value', () => {
    expectTypeOf<MutationRunResult['outcome']>().toEqualTypeOf<
      'completed' | 'unsupported' | 'timed_out'
    >();
  });

  it('should keep a timeout apart from a mutant that was detected', () => {
    expectTypeOf<MutantResult['status']>().toEqualTypeOf<
      'killed' | 'survived' | 'no_coverage' | 'timeout' | 'error'
    >();
    expectTypeOf<CompletedMutationRun['mutants']>().toEqualTypeOf<
      readonly MutantResult[]
    >();
  });

  it('should name a test by its file and its full name', () => {
    expectTypeOf<MutantResult['killedBy']>().toEqualTypeOf<
      readonly TestReference[]
    >();
    expectTypeOf<keyof TestReference>().toEqualTypeOf<'file' | 'name'>();
  });
});
