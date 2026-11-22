import { describe, expect, it } from 'vitest';

import { farewellOf } from '#app/farewell';

describe('farewellOf', () => {
  it('should say nothing when no work runs', () => {
    expect(farewellOf({ scans: 0, improvements: 0 })).toBeUndefined();
  });

  it('should say nothing before the service answered', () => {
    expect(farewellOf(undefined)).toBeUndefined();
  });

  it('should say that the work goes on and how to see it later', () => {
    expect(farewellOf({ scans: 0, improvements: 2 })).toBe(
      '2 improvements keep running. See them with: coverage-autopilot list',
    );
  });

  it('should name one piece of work in the singular', () => {
    expect(farewellOf({ scans: 1, improvements: 0 })).toBe(
      '1 scan keeps running. See them with: coverage-autopilot list',
    );
  });

  it('should name both kinds of work that run', () => {
    expect(farewellOf({ scans: 1, improvements: 2 })).toBe(
      '2 improvements and 1 scan keep running. ' +
        'See them with: coverage-autopilot list',
    );
  });
});
