import { describe, expect, it } from 'vitest';

import { ApprovalMismatchError } from '#improvement/domain/errors/approval-mismatch.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { PatchIntegrityError } from '#improvement/domain/errors/patch-integrity.error';
import {
  afterVerdict,
  approved,
  published,
} from '#improvement/domain/services/verdict.service';
import { BranchName } from '#improvement/domain/value-objects/branch-name.vo';
import {
  improvementIn,
  pullRequestOf,
} from '#tests/support/improvement-journeys';
import {
  hashOf,
  improvementIdOf,
  minutesIn,
  reportOf,
} from '#tests/support/improvement-values';

const AT = minutesIn(10);
const VERIFYING = improvementIn('verifying').state;

describe('afterVerdict', () => {
  it('should publish an accepted patch on the branch of the improvement', () => {
    const state = afterVerdict(VERIFYING, reportOf('accepted'), AT);

    expect(state.status).toBe('publishing');
    expect(state.branch).toEqual(BranchName.of(improvementIdOf()));
    expect(state.attempts[0]?.report).toEqual(reportOf('accepted'));
    expect(state.attempts[0]?.finishedAt).toEqual(AT);
  });

  it('should wait for a person with an accepted patch in review mode', () => {
    const inReview = improvementIn('verifying', { mode: 'review' }).state;

    const state = afterVerdict(inReview, reportOf('accepted'), AT);

    expect(state.status).toBe('awaiting_approval');
    expect(state.branch).toBeNull();
  });

  it('should close the attempt and generate again after a rejection', () => {
    const state = afterVerdict(VERIFYING, reportOf('rejected'), AT);

    expect(state.status).toBe('generating');
    expect(state.attempts.map((attempt) => attempt.isOpen)).toEqual([false]);
  });

  it('should keep the attempt open and open none after an inconclusive one', () => {
    const state = afterVerdict(VERIFYING, reportOf('inconclusive'), AT);

    expect([state.status, state.updatedAt]).toEqual(['verifying', AT]);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]?.isOpen).toBe(true);
  });

  describe('when the report is of another patch', () => {
    it('should throw PatchIntegrityError', () => {
      expect(() =>
        afterVerdict(VERIFYING, reportOf('accepted', 'b'), AT),
      ).toThrow(PatchIntegrityError);
    });
  });

  describe('when the improvement does not verify', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        afterVerdict(
          improvementIn('generating').state,
          reportOf('accepted'),
          AT,
        ),
      ).toThrow(InvalidTransitionError);
    });
  });
});

describe('approved', () => {
  const AWAITING = improvementIn('awaiting_approval').state;

  it('should publish the patch the person saw', () => {
    const state = approved(AWAITING, hashOf('a'), AT);

    expect(state.status).toBe('publishing');
    expect(state.branch).toEqual(BranchName.of(improvementIdOf()));
  });

  describe('when the person saw another patch', () => {
    it('should throw ApprovalMismatchError that a rerun does not help', () => {
      const approve = (): unknown => approved(AWAITING, hashOf('b'), AT);

      expect(approve).toThrow(
        new ApprovalMismatchError(
          `The patch ${hashOf('b')} was approved, and the accepted patch is ` +
            `${hashOf('a')}.`,
        ),
      );
      expect(approve).toThrow(
        expect.objectContaining({
          code: 'approval_mismatch',
          retryable: false,
        }),
      );
    });
  });

  describe('when the improvement does not wait for an approval', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        approved(improvementIn('publishing').state, hashOf('a'), AT),
      ).toThrow(InvalidTransitionError);
    });
  });
});

describe('published', () => {
  it('should complete the improvement with its pull request', () => {
    const state = published(
      improvementIn('publishing').state,
      pullRequestOf(),
      AT,
    );

    expect(state.status).toBe('completed');
    expect(state.pullRequest).toEqual(pullRequestOf());
  });

  describe('when the gate has not accepted a patch to publish', () => {
    it.each(['verifying', 'awaiting_approval'] as const)(
      'should throw InvalidTransitionError in %s',
      (status) => {
        expect(() =>
          published(improvementIn(status).state, pullRequestOf(), AT),
        ).toThrow(
          new InvalidTransitionError(
            `The improvement is ${status}, and this step is for one that is ` +
              'publishing.',
          ),
        );
      },
    );
  });
});
