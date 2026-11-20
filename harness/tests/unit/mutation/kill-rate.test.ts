import { describe, expect, it } from 'vitest';

import {
  countedOf,
  countsOf,
  formatRate,
  reaches,
  unjudgedStatuses,
} from '#harness/mutation/kill-rate';
import { reportWith, times } from '#harness/tests/support/report-builder';

function mutantsWith(...statuses: string[]) {
  return reportWith({ 'a.ts': statuses }).mutants;
}

describe('countsOf', () => {
  it('should count each status that takes part in the rate', () => {
    const mutants = mutantsWith(
      'Killed',
      'Killed',
      'Killed',
      'Survived',
      'Survived',
      'NoCoverage',
      'Timeout',
    );

    expect(countsOf(mutants)).toEqual({
      killed: 3,
      survived: 2,
      noCoverage: 1,
      timeout: 1,
    });
  });

  it('should leave out a mutant that does not compile or breaks the run', () => {
    const mutants = mutantsWith('Killed', 'CompileError', 'RuntimeError');

    expect(countedOf(countsOf(mutants))).toBe(1);
  });
});

describe('the kill rate', () => {
  it('should count a timeout against the tests, not for them', () => {
    const counts = countsOf(mutantsWith('Killed', 'Timeout'));

    expect(formatRate(counts)).toBe('50.00%');
    expect(reaches(counts, 51)).toBe(false);
  });

  it('should count a mutant that no test covers against the tests', () => {
    const counts = countsOf(mutantsWith('Killed', 'NoCoverage', 'Survived'));

    expect(formatRate(counts)).toBe('33.33%');
  });

  it('should reach a floor that the rate equals exactly', () => {
    const counts = countsOf(mutantsWith(...times(9, 'Killed'), 'Survived'));

    expect(reaches(counts, 90)).toBe(true);
    expect(reaches(counts, 90.01)).toBe(false);
    expect(reaches(counts, 0)).toBe(true);
  });

  it('should not let rounding lift a rate over its floor', () => {
    const counts = countsOf(mutantsWith(...times(1999, 'Killed'), 'Survived'));

    expect(formatRate(counts)).toBe('99.95%');
    expect(reaches(counts, 99.96)).toBe(false);
    expect(reaches(counts, 100)).toBe(false);
  });
});

describe('unjudgedStatuses', () => {
  it('should find nothing among the statuses it knows', () => {
    const mutants = mutantsWith(
      'Killed',
      'Survived',
      'NoCoverage',
      'Timeout',
      'CompileError',
      'RuntimeError',
    );

    expect(unjudgedStatuses(mutants)).toEqual([]);
  });

  it('should name a status that is not final, switched off or new', () => {
    const mutants = mutantsWith(
      'Pending',
      'Ignored',
      'Killed',
      'Ignored',
      'New',
    );

    expect(unjudgedStatuses(mutants)).toEqual(['Ignored', 'New', 'Pending']);
  });
});
