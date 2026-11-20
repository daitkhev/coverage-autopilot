import { describe, expect, it } from 'vitest';

import { exitCodeOf } from '#harness/gate/exit-code';
import { HarnessError } from '#harness/shared/harness.error';
import { fakeHost } from '#harness/tests/support/fake-host';

describe('exitCodeOf', () => {
  it('should give the code the command gives', () => {
    const host = fakeHost();

    expect(exitCodeOf(host, () => 0)).toBe(0);
    expect(exitCodeOf(host, () => 1)).toBe(1);
    expect(host.printed).toEqual([]);
  });

  it('should say an error of the harness in one line and fail', () => {
    const host = fakeHost();
    const code = exitCodeOf(host, () => {
      throw new HarnessError('The policy cannot be read.');
    });

    expect(code).toBe(1);
    expect(host.printed).toEqual(['The policy cannot be read.']);
  });

  it('should throw any other error on, because it is a defect', () => {
    const run = (): number => {
      throw new TypeError('a defect');
    };

    expect(() => exitCodeOf(fakeHost(), run)).toThrow(TypeError);
  });
});
