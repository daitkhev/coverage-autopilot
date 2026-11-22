import { beforeEach, describe, expect, it } from 'vitest';

import { ApprovalMismatchError } from '#improvement/domain/errors/approval-mismatch.error';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { hashOf, IMPROVEMENT_ID } from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

/** The hash of the patch the journeys accept. */
const SEEN = hashOf('a');

let world: ImprovementRequestWorld;

beforeEach(() => {
  world = new ImprovementRequestWorld();
});

/** Nothing was saved and no job was queued. */
function expectNothingChanged(): void {
  expect(world.improvements.writes).toEqual([]);
  expect(world.queue.enqueued).toEqual([]);
}

describe('ApproveImprovementHandler', () => {
  describe('execute', () => {
    it('should start publishing the patch the person saw', async () => {
      await world.stored(improvementIn('awaiting_approval'));

      const shown = await world.approve.execute({
        improvementId: IMPROVEMENT_ID,
        patchHash: SEEN,
      });

      expect(shown).toEqual(
        expect.objectContaining({
          id: IMPROVEMENT_ID,
          status: 'publishing',
          phaseStartedAt: world.clock.now(),
          branch: `coverage-autopilot/${IMPROVEMENT_ID}`,
          waitingFor: 'worker',
        }),
      );
    });

    it('should save the approval and queue the job that publishes in one transaction', async () => {
      await world.stored(improvementIn('awaiting_approval'));

      await world.approve.execute({
        improvementId: IMPROVEMENT_ID,
        patchHash: SEEN,
      });

      const { transaction } = world.transactions;
      const [write] = world.improvements.writes;
      expect(write?.improvement.status).toBe('publishing');
      expect(write?.transaction).toBe(transaction);
      expect(world.queue.enqueued).toEqual([
        {
          request: expect.objectContaining({
            idempotencyKey: `improvement:${IMPROVEMENT_ID}:publish`,
            subjectId: IMPROVEMENT_ID,
          }) as unknown,
          transaction,
        },
      ]);
      expect(world.transactions.runs).toBe(1);
    });

    describe('when no improvement has the id', () => {
      it('should answer null and queue nothing', async () => {
        expect(
          await world.approve.execute({
            improvementId: MISSING_ID,
            patchHash: SEEN,
          }),
        ).toBeNull();
        expectNothingChanged();
      });
    });

    describe('when the person saw another patch', () => {
      it('should throw ApprovalMismatchError and publish nothing', async () => {
        await world.stored(improvementIn('awaiting_approval'));

        await expect(
          world.approve.execute({
            improvementId: IMPROVEMENT_ID,
            patchHash: hashOf('b'),
          }),
        ).rejects.toThrow(ApprovalMismatchError);
        expectNothingChanged();
      });
    });

    describe('when the improvement does not wait for an approval', () => {
      it.each(['verifying', 'publishing', 'cancelled'] as const)(
        'should throw InvalidTransitionError while it is %s',
        async (status) => {
          await world.stored(improvementIn(status));

          await expect(
            world.approve.execute({
              improvementId: IMPROVEMENT_ID,
              patchHash: SEEN,
            }),
          ).rejects.toThrow(InvalidTransitionError);
          expectNothingChanged();
        },
      );
    });

    describe('when the id is not one of an improvement', () => {
      it('should throw InvalidImprovementValueError', async () => {
        await expect(
          world.approve.execute({ improvementId: '42', patchHash: SEEN }),
        ).rejects.toThrow(InvalidImprovementValueError);
      });
    });
  });
});
