import { describe, expect, expectTypeOf, it } from 'vitest';

import { ARTIFACT_STORE } from '#ports/artifact-store.port';
import {
  SANDBOX,
  type Sandbox,
  type SandboxCommandRequest,
  type SandboxCommandResult,
} from '#ports/sandbox.port';

describe('Sandbox', () => {
  it('should be injected by a token of its own', () => {
    expect(SANDBOX.description).toBe('Sandbox');
    expect(SANDBOX).not.toBe(ARTIFACT_STORE);
  });

  it('should take a list of arguments, never a line for a shell', () => {
    expectTypeOf<SandboxCommandRequest['command']>().toEqualTypeOf<
      readonly string[]
    >();
  });

  it('should reach nothing unless the request opens the network', () => {
    expectTypeOf<SandboxCommandRequest['network']>().toEqualTypeOf<
      'none' | 'open'
    >();
  });

  it('should answer a command that failed with a value', () => {
    expectTypeOf<SandboxCommandResult['outcome']>().toEqualTypeOf<
      'exited' | 'timed_out'
    >();
    expectTypeOf<SandboxCommandResult['exitCode']>().toEqualTypeOf<
      number | null
    >();
  });

  it('should take a signal that stops the command', () => {
    expectTypeOf<Sandbox['run']>().parameter(1).toEqualTypeOf<AbortSignal>();
  });
});
