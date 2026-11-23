import { describe, expect, it } from 'vitest';

import {
  type AreaResult,
  isInArea,
  resultOf,
  verdictOf,
} from '#harness/mutation/verdict';
import {
  reportWith,
  RULES,
  times,
} from '#harness/tests/support/report-builder';

const A = 'harness/rules/a.ts';
const B = 'harness/rules/b.ts';

describe('isInArea', () => {
  it('should take the places of the area but the ones left out', () => {
    expect(isInArea(A, RULES)).toBe(true);
    expect(isInArea('harness/rules/tests/a.test.ts', RULES)).toBe(false);
    expect(isInArea('harness/gate/steps.ts', RULES)).toBe(false);
  });
});

describe('resultOf', () => {
  it('should give the counts of the mutants of the area', () => {
    const report = reportWith({
      [A]: ['Killed', 'Survived'],
      [B]: ['Killed', 'Timeout', 'RuntimeError'],
      'harness/gate/steps.ts': ['Survived', 'Survived'],
    });

    expect(resultOf(RULES, report, [A, B])).toEqual({
      kind: 'rate',
      counts: { killed: 2, survived: 1, noCoverage: 0, timeout: 1 },
    });
  });

  it('should be not applicable after a full run with nothing to count', () => {
    const report = reportWith({ [A]: [], [B]: ['CompileError'] });

    expect(resultOf(RULES, report, [A, B])).toEqual({ kind: 'not_applicable' });
  });

  it('should be not measured when a file of the area is not in the report', () => {
    const report = reportWith({ [A]: ['Killed'] });

    expect(resultOf(RULES, report, [A, B])).toEqual({
      kind: 'not_measured',
      reason: `1 file(s) of the area are not in the report, such as ${B}.`,
    });
  });

  it('should not take an empty report for an area with nothing to mutate', () => {
    expect(resultOf(RULES, reportWith({}), [A]).kind).toBe('not_measured');
  });

  it.each(['Pending', 'Ignored', 'SomethingNew'])(
    'should be not measured when a mutant has the status %s',
    (status) => {
      const report = reportWith({ [A]: ['Killed', status] });

      expect(resultOf(RULES, report, [A])).toEqual({
        kind: 'not_measured',
        reason: `A mutant has the status ${status}.`,
      });
    },
  );

  it('should not be troubled by a status outside the area', () => {
    const report = reportWith({
      [A]: ['Killed'],
      'harness/gate/steps.ts': ['Pending'],
    });

    expect(resultOf(RULES, report, [A]).kind).toBe('rate');
  });
});

describe('verdictOf', () => {
  function rate(killed: number, survived: number): AreaResult {
    const statuses = [
      ...times(killed, 'Killed'),
      ...times(survived, 'Survived'),
    ];
    return resultOf(RULES, reportWith({ [A]: statuses }), [A]);
  }

  it('should pass a rate at or above its floor', () => {
    expect(verdictOf('rules', rate(9, 1), 90)).toEqual({
      area: 'rules',
      passed: true,
      detail:
        '90.00%: 9 killed, 1 survived, 0 not covered, 0 timed out, ' +
        'at or above the floor of 90%',
    });
  });

  it('should fail a rate below its floor', () => {
    const verdict = verdictOf('rules', rate(8, 2), 90);

    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain('80.00%');
    expect(verdict.detail).toContain('below the floor of 90%');
  });

  it('should fail a rate that has no floor, however high it is', () => {
    const verdict = verdictOf('rules', rate(10, 0), undefined);

    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain('A floor must be decided');
  });

  it('should pass an area with nothing to mutate and no floor', () => {
    expect(verdictOf('rules', { kind: 'not_applicable' }, undefined)).toEqual({
      area: 'rules',
      passed: true,
      detail: 'not_applicable: nothing to mutate',
    });
  });

  it('should fail an area with a floor and nothing to mutate', () => {
    const verdict = verdictOf('rules', { kind: 'not_applicable' }, 80);

    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain('mutants were expected');
  });

  it('should fail an area that was not measured, floor or no floor', () => {
    const result: AreaResult = { kind: 'not_measured', reason: 'No report.' };

    expect(verdictOf('rules', result, 0)).toEqual({
      area: 'rules',
      passed: false,
      detail: 'not measured. No report.',
    });
    expect(verdictOf('rules', result, undefined).passed).toBe(false);
  });
});
