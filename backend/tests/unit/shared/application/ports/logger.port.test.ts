import { describe, expect, expectTypeOf, it } from 'vitest';

import { type LogFields, LOGGER, type Logger } from '#ports/logger.port';
import { SANDBOX } from '#ports/sandbox.port';

describe('Logger', () => {
  it('should be injected by a token of its own', () => {
    expect(LOGGER.description).toBe('Logger');
    expect(LOGGER).not.toBe(SANDBOX);
  });

  it('should carry fields that a line holds without nesting', () => {
    expectTypeOf<LogFields[string]>().toEqualTypeOf<
      string | number | boolean | null
    >();
  });

  it('should give a child that is a logger too', () => {
    expectTypeOf<Logger['child']>().returns.toEqualTypeOf<Logger>();
  });

  it('should be told about a secret read after the start', () => {
    expectTypeOf<Logger['conceal']>().parameter(0).toEqualTypeOf<string>();
  });
});
