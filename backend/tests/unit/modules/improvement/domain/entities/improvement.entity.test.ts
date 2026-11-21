import { describe, expect, it } from 'vitest';

import { Improvement } from '#improvement/domain/entities/improvement.entity';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import {
  IMPROVEMENT_STATUSES,
  type ImprovementStatus,
  isFinal,
} from '#improvement/domain/value-objects/improvement-status.vo';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import {
  createdImprovement,
  failureOf,
  improvementIn,
  pullRequestOf,
  STEP_MINUTE,
  WINDOW_OPENS_AT,
} from '#tests/support/improvement-journeys';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  baselineOf,
  CREATED_AT,
  generatedOf,
  hashOf,
  improvementIdOf,
  minutesIn,
  reportOf,
  requestOf,
} from '#tests/support/improvement-values';

const AT = minutesIn(STEP_MINUTE.windowOpens);

const NOT_FINAL = IMPROVEMENT_STATUSES.filter((status) => !isFinal(status));

/** The step a run after a crash takes in a status, and where it leads. */
const RECOVERY: readonly (readonly [
  ImprovementStatus,
  (improvement: Improvement) => void,
  ImprovementStatus,
])[] = [
  [
    'created',
    (improvement) => {
      improvement.startWork(AT);
    },
    'analyzing',
  ],
  [
    'analyzing',
    (improvement) => {
      improvement.recordBaselineSnapshot(
        {
          id: SnapshotId.create(BASELINE_SNAPSHOT_ID),
          commit: CommitSha.create(BASE_COMMIT),
        },
        AT,
      );
      improvement.recordVerificationBaseline(baselineOf(), AT);
      improvement.startGenerating(AT);
    },
    'generating',
  ],
  [
    'generating',
    (improvement) => {
      improvement.openAttempt(minutesIn(STEP_MINUTE.attemptOpened));
    },
    'generating',
  ],
  [
    'waiting_for_limit',
    (improvement) => {
      improvement.resume(WINDOW_OPENS_AT);
    },
    'generating',
  ],
  [
    'verifying',
    (improvement) => {
      improvement.recordGeneration(generatedOf(), AT);
    },
    'verifying',
  ],
  [
    'awaiting_approval',
    (improvement) => {
      improvement.approve(hashOf('a'), AT);
    },
    'publishing',
  ],
  [
    'publishing',
    (improvement) => {
      improvement.recordPullRequest(pullRequestOf(), AT);
    },
    'completed',
  ],
];

describe('Improvement', () => {
  describe('create', () => {
    it('should hold the request, with no work started', () => {
      const improvement = createdImprovement();

      expect(improvement.id).toEqual(improvementIdOf());
      expect(improvement.request).toEqual(requestOf());
      expect(improvement.status).toBe('created');
      expect([
        improvement.phaseStartedAt,
        improvement.createdAt,
        improvement.updatedAt,
      ]).toEqual([CREATED_AT, CREATED_AT, CREATED_AT]);
      expect([
        improvement.deadlineAt,
        improvement.resumesAt,
        improvement.baselineSnapshotId,
        improvement.verificationBaseline,
        improvement.branch,
        improvement.pullRequest,
        improvement.failure,
        improvement.skip,
        improvement.currentAttempt,
      ]).toEqual(Array.from({ length: 9 }, () => null));
      expect([improvement.limitWaits, improvement.attempts]).toEqual([0, []]);
      expect(improvement.version).toBe(1);
    });
  });

  describe('restore', () => {
    it.each(IMPROVEMENT_STATUSES)(
      'should bring back a %s improvement as it was stored',
      (status) => {
        const { state } = improvementIn(status);

        expect(Improvement.restore(state).state).toEqual(state);
      },
    );

    it.each(RECOVERY)(
      'should let a run after a crash go on from %s',
      (status, step, next) => {
        const improvement = Improvement.restore(improvementIn(status).state);

        step(improvement);

        expect(improvement.status).toBe(next);
      },
    );

    it('should find the open attempt of a run after a crash', () => {
      const improvement = Improvement.restore(
        improvementIn('waiting_for_limit').state,
      );
      improvement.resume(WINDOW_OPENS_AT);

      expect(improvement.openAttempt(AT).number).toBe(1);
      expect(improvement.attempts).toHaveLength(1);
    });

    describe('when the stored state breaks a rule', () => {
      it('should throw InvalidImprovementValueError', () => {
        const state = { ...improvementIn('created').state, version: 0 };

        expect(() => Improvement.restore(state)).toThrow(
          InvalidImprovementValueError,
        );
      });
    });
  });

  describe('a journey along the main path', () => {
    it('should move the phase and the change with every transition', () => {
      const improvement = improvementIn('completed');

      expect(improvement.phaseStartedAt).toEqual(
        minutesIn(STEP_MINUTE.published),
      );
      expect(improvement.updatedAt).toEqual(minutesIn(STEP_MINUTE.published));
      expect(improvement.createdAt).toEqual(CREATED_AT);
    });

    it('should keep the request, the policy and the generator it was made with', () => {
      expect(improvementIn('completed').request).toEqual(requestOf());
    });

    it('should leave the version to the store', () => {
      expect(improvementIn('completed').version).toBe(1);
    });

    it('should keep the accepted attempt and what the journey recorded', () => {
      const improvement = improvementIn('completed');

      expect(improvement.acceptedAttempt?.report).toEqual(reportOf('accepted'));
      expect(improvement.pullRequest).toEqual(pullRequestOf());
      expect(improvement.branch?.value).toContain(improvement.id.value);
      expect(improvement.baselineSnapshotId?.value).toBe(BASELINE_SNAPSHOT_ID);
      expect(improvement.verificationBaseline).toEqual(baselineOf());
      expect(improvement.currentAttempt).toBeNull();
    });
  });

  describe('lastRejectedAttempt', () => {
    it('should give the feedback for the next attempt', () => {
      const improvement = improvementIn('verifying');
      improvement.recordVerdict(reportOf('rejected'), AT);

      expect(improvement.lastRejectedAttempt?.number).toBe(1);
      expect(improvement.acceptedAttempt).toBeNull();
    });
  });

  describe('waitingFor', () => {
    it.each<[ImprovementStatus, string | null]>([
      ['waiting_for_limit', 'limit'],
      ['awaiting_approval', 'approval'],
      ['generating', null],
      ['completed', null],
    ])('should say what a %s improvement waits for', (status, wait) => {
      expect(improvementIn(status).waitingFor).toBe(wait);
    });
  });

  describe('usage and attemptAllowance', () => {
    it('should tell what was spent and whether an attempt may open', () => {
      const improvement = improvementIn('verifying');

      expect(improvement.usage(AT).attempts).toBe(1);
      expect(improvement.attemptAllowance(minutesIn(10))).toEqual({
        allowed: true,
      });
    });
  });

  describe('fail', () => {
    it.each(NOT_FINAL)(
      'should end a %s improvement with a failure',
      (status) => {
        const improvement = improvementIn(status);

        improvement.fail(failureOf(), AT);

        expect(improvement.status).toBe('failed');
        expect(improvement.failure).toEqual(failureOf());
        expect(improvement.currentAttempt).toBeNull();
      },
    );
  });

  describe('cancel', () => {
    it.each(NOT_FINAL)(
      'should cancel a %s improvement at the moment',
      (status) => {
        const improvement = improvementIn(status);

        improvement.cancel(AT);

        expect(improvement.status).toBe('cancelled');
        expect(improvement.cancelledAt).toEqual(AT);
        expect(improvement.currentAttempt).toBeNull();
      },
    );

    it('should have no moment of a cancel while it is not cancelled', () => {
      expect(improvementIn('failed').cancelledAt).toBeNull();
    });

    describe('when the improvement is over', () => {
      it.each(['completed', 'failed', 'cancelled', 'skipped'] as const)(
        'should throw InvalidTransitionError for a %s one',
        (status) => {
          expect(() => {
            improvementIn(status).cancel(AT);
          }).toThrow(
            new InvalidTransitionError(
              `An improvement that is ${status} cannot become cancelled.`,
            ),
          );
        },
      );
    });
  });
});
