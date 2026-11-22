import { beforeEach, describe, expect, it } from 'vitest';

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

      expect(shown).toEqual({
        outcome: 'approved',
        improvement: expect.objectContaining({
          id: IMPROVEMENT_ID,
          status: 'publishing',
          phaseStartedAt: world.clock.now(),
          branch: `coverage-autopilot/${IMPROVEMENT_ID}`,
          waitingFor: 'worker',
        }) as unknown,
      });
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
      it('should refuse with patch_hash_mismatch and publish nothing', async () => {
        await world.stored(improvementIn('awaiting_approval'));

        const refused = await world.approve.execute({
          improvementId: IMPROVEMENT_ID,
          patchHash: hashOf('b'),
        });

        expect(refused).toEqual({
          outcome: 'refused',
          reason: 'patch_hash_mismatch',
          message:
            `The accepted patch of the improvement ${IMPROVEMENT_ID} is ` +
            `${SEEN}, not ${hashOf('b')}.`,
        });
        expectNothingChanged();
      });
    });

    describe('when the improvement does not wait for an approval', () => {
      it.each(['verifying', 'publishing', 'cancelled'] as const)(
        'should refuse with status_conflict while it is %s',
        async (status) => {
          await world.stored(improvementIn(status));

          const refused = await world.approve.execute({
            improvementId: IMPROVEMENT_ID,
            patchHash: SEEN,
          });

          expect(refused).toEqual({
            outcome: 'refused',
            reason: 'status_conflict',
            message:
              `The improvement ${IMPROVEMENT_ID} is ${status}, and only one ` +
              'that awaits approval can be approved.',
          });
          expectNothingChanged();
        },
      );
    });

    describe('when the id is not one of an improvement', () => {
      it('should answer null, as no improvement has it', async () => {
        expect(
          await world.approve.execute({ improvementId: '42', patchHash: SEEN }),
        ).toBeNull();
        expectNothingChanged();
      });
    });
  });
});
