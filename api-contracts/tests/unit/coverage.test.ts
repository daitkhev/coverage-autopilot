import { describe, expect, it } from 'vitest';

import {
  coverageCounterSchema,
  coverageCountersSchema,
  thresholdSchema,
} from '#api-contracts/coverage';

const counter = { covered: 7, total: 8, percentage: 87.5 };

describe('coverageCounterSchema', () => {
  it('should accept a percentage with its counts', () => {
    expect(coverageCounterSchema.safeParse(counter).success).toBe(true);
  });

  describe('when the total is zero', () => {
    it('should accept no percentage', () => {
      const empty = { covered: 0, total: 0, percentage: null };

      expect(coverageCounterSchema.safeParse(empty).success).toBe(true);
    });
  });

  it.each([
    ['a percentage above 100', { ...counter, percentage: 100.5 }],
    ['a negative count', { ...counter, covered: -1 }],
    ['a fractional count', { ...counter, total: 8.5 }],
    ['a missing percentage', { covered: 7, total: 8 }],
    ['an unknown key', { ...counter, ratio: 0.875 }],
  ])('should refuse %s', (_name, value) => {
    expect(coverageCounterSchema.safeParse(value).success).toBe(false);
  });
});

describe('coverageCountersSchema', () => {
  const counters = {
    statements: counter,
    branches: counter,
    functions: counter,
    lines: counter,
  };

  it('should accept the four counters', () => {
    expect(coverageCountersSchema.safeParse(counters).success).toBe(true);
  });

  it('should refuse a missing counter', () => {
    const value = { ...counters, functions: undefined };

    expect(coverageCountersSchema.safeParse(value).success).toBe(false);
  });
});

describe('thresholdSchema', () => {
  it('should accept a metric and a percentage', () => {
    const value = { metric: 'lines', percentage: 80 };

    expect(thresholdSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['an unknown metric', { metric: 'mutants', percentage: 80 }],
    ['a percentage out of range', { metric: 'lines', percentage: 120 }],
  ])('should refuse %s', (_name, value) => {
    expect(thresholdSchema.safeParse(value).success).toBe(false);
  });
});
