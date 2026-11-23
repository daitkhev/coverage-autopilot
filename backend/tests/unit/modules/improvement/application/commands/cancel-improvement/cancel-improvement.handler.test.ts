import { beforeEach, describe, expect, it } from 'vitest';

import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { IMPROVEMENT_ID } from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

let world: ImprovementRequestWorld;

beforeEach(() => {
  world = new ImprovementRequestWorld();
});

describe('CancelImprovementHandler', () => {
  describe('execute', () => {
    it.each([
      'created',
      'generating',
      'waiting_for_limit',
      'awaiting_approval',
    ] as const)(
      'should cancel an improvement that is %s and show no job of it',
      async (status) => {
        await world.stored(improvementIn(status));
        world.queue.progress = {
          jobId: 'job-1',
          steps: [{ code: 'generate', status: 'running' }],
          updatedAt: world.clock.now(),
        };

        const shown = await world.cancel.execute({
          improvementId: IMPROVEMENT_ID,
        });

        expect(shown).toEqual({
          outcome: 'cancelled',
          improvement: expect.objectContaining({
            status: 'cancelled',
            cancelledAt: world.clock.now(),
            progress: null,
            waitingFor: null,
          }) as unknown,
        });
      },
    );

    it('should save the cancel and cancel every job of it in one transaction', async () => {
      await world.stored(improvementIn('verifying'));

      await world.cancel.execute({ improvementId: IMPROVEMENT_ID });

      const { transaction } = world.transactions;
      const [write] = world.improvements.writes;
      expect(write?.improvement.status).toBe('cancelled');
      expect(write?.transaction).toBe(transaction);
      expect(world.queue.cancelledSubjects).toEqual([
        { subjectId: IMPROVEMENT_ID, transaction },
      ]);
      expect(world.transactions.runs).toBe(1);
    });

    describe('when the improvement ended already', () => {
      it.each(['completed', 'skipped', 'failed', 'cancelled'] as const)(
        'should give the improvement that is %s as it is and change nothing',
        async (status) => {
          await world.stored(improvementIn(status));

          const shown = await world.cancel.execute({
            improvementId: IMPROVEMENT_ID,
          });

          expect(shown?.outcome).toBe('ended');
          expect(shown?.improvement.status).toBe(status);
          expect(world.improvements.writes).toEqual([]);
          expect(world.queue.cancelledSubjects).toEqual([]);
        },
      );
    });

    describe('when no improvement has the id', () => {
      it('should answer null and cancel no job', async () => {
        expect(
          await world.cancel.execute({ improvementId: MISSING_ID }),
        ).toBeNull();
        expect(world.queue.cancelledSubjects).toEqual([]);
      });
    });

    describe('when the id is not one of an improvement', () => {
      it('should answer null, as no improvement has it', async () => {
        expect(
          await world.cancel.execute({ improvementId: 'improvement-1' }),
        ).toBeNull();
        expect(world.transactions.runs).toBe(0);
      });
    });
  });
});
