import { beforeEach, describe, expect, it } from 'vitest';

import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { IMPROVEMENT_ID, patchOf } from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

let world: ImprovementRequestWorld;

beforeEach(() => {
  world = new ImprovementRequestWorld();
});

describe('GetImprovementPatchHandler', () => {
  describe('execute', () => {
    it.each(['awaiting_approval', 'publishing', 'completed'] as const)(
      'should give the accepted patch in full, named by its hash, once the improvement is %s',
      async (status) => {
        await world.stored(improvementIn(status));

        expect(
          await world.getPatch.execute({ improvementId: IMPROVEMENT_ID }),
        ).toEqual({
          outcome: 'found',
          patch: {
            improvementId: IMPROVEMENT_ID,
            attemptNumber: 1,
            patch: patchOf().text,
            patchHash: patchOf().hash,
          },
        });
      },
    );

    it.each(['created', 'verifying', 'failed'] as const)(
      'should answer no_accepted_patch while the improvement is %s',
      async (status) => {
        await world.stored(improvementIn(status));

        expect(
          await world.getPatch.execute({ improvementId: IMPROVEMENT_ID }),
        ).toEqual({ outcome: 'no_accepted_patch' });
      },
    );

    describe('when no improvement has the id', () => {
      it('should answer null', async () => {
        expect(
          await world.getPatch.execute({ improvementId: MISSING_ID }),
        ).toBeNull();
      });
    });

    describe('when the id is not one of an improvement', () => {
      it('should answer null, as no improvement has it', async () => {
        expect(
          await world.getPatch.execute({ improvementId: 'latest' }),
        ).toBeNull();
      });
    });
  });
});
