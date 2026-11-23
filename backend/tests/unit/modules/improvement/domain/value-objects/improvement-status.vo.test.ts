import { describe, expect, it } from 'vitest';

import {
  canMove,
  IMPROVEMENT_STATUSES,
  type ImprovementStatus,
  isFinal,
  waitOf,
} from '#improvement/domain/value-objects/improvement-status.vo';

const FINAL: readonly ImprovementStatus[] = [
  'completed',
  'skipped',
  'failed',
  'cancelled',
];

const OPEN = IMPROVEMENT_STATUSES.filter((status) => !FINAL.includes(status));

/** The moves of the transition table, besides failing and cancelling. */
const MOVES: readonly (readonly [ImprovementStatus, ImprovementStatus])[] = [
  ['created', 'analyzing'],
  ['analyzing', 'generating'],
  ['analyzing', 'skipped'],
  ['generating', 'verifying'],
  ['generating', 'waiting_for_limit'],
  ['waiting_for_limit', 'generating'],
  ['verifying', 'generating'],
  ['verifying', 'awaiting_approval'],
  ['verifying', 'publishing'],
  ['awaiting_approval', 'publishing'],
  ['publishing', 'completed'],
];

const ENDINGS: readonly ImprovementStatus[] = ['failed', 'cancelled'];

function isListed(from: ImprovementStatus, to: ImprovementStatus): boolean {
  return MOVES.some(([left, right]) => left === from && right === to);
}

describe('IMPROVEMENT_STATUSES', () => {
  it('should list the statuses in the order of the contract', () => {
    expect(IMPROVEMENT_STATUSES).toEqual([
      'created',
      'analyzing',
      'generating',
      'waiting_for_limit',
      'verifying',
      'awaiting_approval',
      'publishing',
      'completed',
      'failed',
      'cancelled',
      'skipped',
    ]);
  });
});

describe('isFinal', () => {
  it.each(IMPROVEMENT_STATUSES)('should know whether %s is final', (status) => {
    expect(isFinal(status)).toBe(FINAL.includes(status));
  });
});

describe('waitOf', () => {
  it('should name a person and a window as what is waited for', () => {
    expect(waitOf('awaiting_approval')).toBe('approval');
    expect(waitOf('waiting_for_limit')).toBe('limit');
  });

  it.each(IMPROVEMENT_STATUSES.filter((status) => !status.includes('wait')))(
    'should name nothing for %s',
    (status) => {
      expect(waitOf(status)).toBeNull();
    },
  );
});

describe('canMove', () => {
  it.each(MOVES)('should let %s become %s', (from, to) => {
    expect(canMove(from, to)).toBe(true);
  });

  it.each(OPEN)('should let %s fail or be cancelled', (status) => {
    expect(ENDINGS.every((to) => canMove(status, to))).toBe(true);
  });

  it.each(FINAL)('should let %s become nothing', (status) => {
    expect(IMPROVEMENT_STATUSES.filter((to) => canMove(status, to))).toEqual(
      [],
    );
  });

  it.each(OPEN)('should refuse every other move of %s', (from) => {
    const others = IMPROVEMENT_STATUSES.filter(
      (to) => !ENDINGS.includes(to) && !isListed(from, to),
    );

    expect(others.filter((to) => canMove(from, to))).toEqual([]);
  });
});
