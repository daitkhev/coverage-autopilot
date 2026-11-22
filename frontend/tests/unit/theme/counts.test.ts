import { describe, expect, it } from 'vitest';

import { coverageMetricSchema } from '@coverage-autopilot/api-contracts/statuses';

import {
  COUNTER_NAMES,
  COUNTERS,
  countWords,
  failingTestsWords,
  percentWords,
  ratioWords,
  thresholdLabel,
} from '#theme/counts';

describe('the counters and the contract', () => {
  it('should name every counter of the contract and list each once', () => {
    const metrics = [...coverageMetricSchema.options].sort();

    expect(Object.keys(COUNTER_NAMES).sort()).toEqual(metrics);
    expect([...COUNTERS].sort()).toEqual(metrics);
  });
});

describe('percentWords', () => {
  it.each([
    [41.2, '41.2%'],
    [0, '0.0%'],
    [25, '25.0%'],
    [87.46, '87.5%'],
    [100, '100.0%'],
  ])('should write %f as %s', (percentage, words) => {
    expect(percentWords(percentage)).toBe(words);
  });
});

describe('thresholdLabel', () => {
  it.each([
    [true, 'threshold'],
    [false, 'own threshold'],
  ])('should mark only a threshold of its own', (isDefault, words) => {
    expect(thresholdLabel({ isDefault })).toBe(words);
  });
});

describe('ratioWords', () => {
  it('should write covered of the total', () => {
    expect(ratioWords(12, 30)).toBe('12/30');
    expect(ratioWords(0, 0)).toBe('0/0');
  });
});

describe('countWords', () => {
  it.each([
    [0, '0 files'],
    [1, '1 file'],
    [3, '3 files'],
  ])('should write %i with its noun as %s', (count, words) => {
    expect(countWords(count, 'file')).toBe(words);
  });

  describe('when the plural is not the singular with an s', () => {
    it('should take the plural it is given', () => {
      expect(countWords(5, 'repository', 'repositories')).toBe(
        '5 repositories',
      );
      expect(countWords(1, 'repository', 'repositories')).toBe('1 repository');
    });
  });
});

describe('failingTestsWords', () => {
  it.each([
    [{ ran: 53, failed: 33 }, '33 of 53 tests fail in the sandbox'],
    [{ ran: 1, failed: 1 }, '1 of 1 test fails in the sandbox'],
  ])('should say %j as %s', (tests, words) => {
    expect(failingTestsWords(tests)).toBe(words);
  });

  it('should say nothing when no test failed, or the scan did not count them', () => {
    expect(failingTestsWords({ ran: 53, failed: 0 })).toBeNull();
    expect(failingTestsWords(null)).toBeNull();
  });
});
