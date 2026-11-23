import { beforeEach, describe, expect, it } from 'vitest';

import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { IMPROVEMENT_ID } from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

let world: ImprovementRequestWorld;

beforeEach(() => {
  world = new ImprovementRequestWorld();
});

describe('GetImprovementHandler', () => {
  describe('execute', () => {
    it('should give the improvement with its attempts and what its job adds', async () => {
      await world.stored(improvementIn('verifying'));
      world.queue.wait = 'repository';

      const shown = await world.getImprovement.execute({
        improvementId: IMPROVEMENT_ID,
      });

      expect(shown).toEqual(
        expect.objectContaining({
          id: IMPROVEMENT_ID,
          status: 'verifying',
          waitingFor: 'repository',
          attempts: [
            expect.objectContaining({ number: 1, status: 'open' }) as unknown,
          ],
        }),
      );
    });

    describe('when no improvement has the id', () => {
      it('should answer null', async () => {
        expect(
          await world.getImprovement.execute({ improvementId: MISSING_ID }),
        ).toBeNull();
      });
    });

    describe('when the id is not one of an improvement', () => {
      it('should answer null, as no improvement has it', async () => {
        await world.stored(improvementIn('verifying'));

        expect(
          await world.getImprovement.execute({ improvementId: 'latest' }),
        ).toBeNull();
      });
    });
  });
});
