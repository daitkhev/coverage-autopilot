import { describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import {
  besideWords,
  canBeCancelled,
  groupOf,
} from '#screens/improvements/improvement-words';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';

const {
  awaiting_approval,
  created,
  verifying,
  waiting_for_limit,
  completed,
  failed,
  cancelled,
  skipped,
} = IMPROVEMENT_BY_STATUS;

function said(improvement: Improvement): string {
  return besideWords(improvement, 'UTC');
}

describe('groupOf', () => {
  it('should put what an improvement waits for over its status', () => {
    expect(groupOf({ ...created, waitingFor: 'approval' })).toBe('needsYou');
    expect(groupOf({ ...verifying, waitingFor: 'worker' })).toBe('waiting');
  });

  it('should group an improvement that waits for nobody by its status', () => {
    expect(groupOf({ ...created, waitingFor: null })).toBe('waiting');
    expect(groupOf(verifying)).toBe('running');
    expect(groupOf(completed)).toBe('finished');
  });
});

describe('besideWords', () => {
  describe('when the improvement waits', () => {
    it.each<readonly [string, Improvement, string]>([
      ['for its turn', { ...created, waitingFor: null }, 'waits for its turn'],
      [
        'for a worker',
        { ...created, waitingFor: 'worker' },
        'waits for a free worker',
      ],
      [
        'for a limit with no moment it ends',
        { ...waiting_for_limit, resumesAt: null },
        'waits for the limit',
      ],
      [
        'for a limit, by its status alone',
        { ...waiting_for_limit, waitingFor: null },
        'waits for the limit until 16:00',
      ],
    ])('should say that it waits %s', (_case, improvement, words) => {
      expect(said(improvement)).toBe(words);
    });
  });

  describe('when a patch waits and the service names no wait', () => {
    it('should still ask for the approval', () => {
      expect(said({ ...awaiting_approval, waitingFor: null })).toBe(
        'approve the patch',
      );
    });
  });

  describe('when the checks have no step that runs', () => {
    it('should say that the attempt is verified', () => {
      expect(said({ ...verifying, progress: null })).toBe(
        'attempt 2 of 3, verifying',
      );
    });
  });

  describe('when the service has not said how it ended', () => {
    it.each<readonly [string, Improvement, string]>([
      ['completed', { ...completed, pullRequest: null }, 'published'],
      ['failed', { ...failed, failure: null }, 'failed'],
      ['cancelled', { ...cancelled, cancelledAt: null }, 'cancelled'],
      ['skipped', { ...skipped, skip: null }, 'skipped'],
    ])('should say %s alone', (_case, improvement, words) => {
      expect(said(improvement)).toBe(words);
    });
  });
});

describe('canBeCancelled', () => {
  it('should allow a cancel until the work ends, whatever it waits for', () => {
    expect(
      [awaiting_approval, created, verifying, waiting_for_limit].map(
        canBeCancelled,
      ),
    ).toEqual([true, true, true, true]);
    expect([completed, failed, cancelled, skipped].map(canBeCancelled)).toEqual(
      [false, false, false, false],
    );
  });
});
