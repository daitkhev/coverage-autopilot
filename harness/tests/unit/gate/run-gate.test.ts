import { describe, expect, it } from 'vitest';

import { runGate } from '#harness/gate/run-gate';
import { fakeHost } from '#harness/tests/support/fake-host';

describe('runGate', () => {
  it('should run the fast profile when no name is given', () => {
    const host = fakeHost();

    expect(runGate([], host)).toBe(0);
    expect(host.printed).toEqual([
      '\n== format',
      '\n== lint',
      '\n== types',
      '\n== architecture',
      '\ncheck fast: passed',
    ]);
  });

  it('should start each step as the list of steps describes it', () => {
    const host = fakeHost();

    runGate(['architecture'], host);

    expect(host.started).toEqual([
      expect.objectContaining({
        name: 'architecture',
        script: 'harness/bin/ratchet.ts',
        arguments: [],
      }),
    ]);
  });

  it('should stop at the first red step and fail', () => {
    const host = fakeHost({
      passes: (command) => !command.script.includes('eslint'),
    });

    expect(runGate(['fast'], host)).toBe(1);
    expect(host.started).toHaveLength(2);
    expect(host.printed.at(-1)).toBe('\ncheck fast: failed at lint');
  });

  it('should fail on a name that is no profile and no step', () => {
    const host = fakeHost();

    expect(runGate(['everything'], host)).toBe(1);
    expect(host.started).toEqual([]);
    expect(host.printed[0]).toContain('"everything" is not a profile');
  });
});
