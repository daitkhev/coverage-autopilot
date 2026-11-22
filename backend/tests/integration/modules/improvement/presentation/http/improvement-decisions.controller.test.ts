import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type ErrorBody,
  errorSchema,
} from '@coverage-autopilot/api-contracts/errors';
import { improvementSchema } from '@coverage-autopilot/api-contracts/improvements';

import { ImprovementDecisionsController } from '#improvement/presentation/http/improvement-decisions.controller';
import type { HttpService } from '#tests/support/http-service';
import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { improvementRoutes } from '#tests/support/improvement-routes';
import { hashOf, IMPROVEMENT_ID } from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

/** The hash of the patch the journeys accept. */
const SEEN = hashOf('a');

let world: ImprovementRequestWorld;
let service: HttpService;

beforeEach(async () => {
  world = new ImprovementRequestWorld();
  service = await improvementRoutes(world, ImprovementDecisionsController);
});

afterEach(async () => {
  await service.close();
});

async function approved(
  body: unknown = { patchHash: SEEN },
  id = IMPROVEMENT_ID,
) {
  return service.send('POST', `/improvements/${id}/approve`, { body });
}

async function cancelled(body: unknown = {}, id = IMPROVEMENT_ID) {
  return service.send('POST', `/improvements/${id}/cancel`, { body });
}

/** The status and the error of an answer that is not a success. */
async function refusalOf(
  answer: ReturnType<typeof approved>,
): Promise<[number, ErrorBody]> {
  const { status, body } = await answer;
  return [status, errorSchema.parse(body)];
}

/** Nothing was saved and no job was queued. */
function expectNothingChanged(): void {
  expect(world.improvements.writes).toEqual([]);
  expect(world.queue.enqueued).toEqual([]);
}

describe('ImprovementDecisionsController', () => {
  describe('POST /improvements/:id/approve', () => {
    it('should answer 202 with the improvement that publishes next', async () => {
      await world.stored(improvementIn('awaiting_approval'));

      const answer = await approved();

      expect(answer.status).toBe(202);
      expect(improvementSchema.parse(answer.body)).toMatchObject({
        id: IMPROVEMENT_ID,
        status: 'publishing',
        waitingFor: 'worker',
      });
      expect(world.queue.enqueued).toHaveLength(1);
    });

    describe('when the hash names another patch', () => {
      it('should answer 409 patch_hash_mismatch', async () => {
        await world.stored(improvementIn('awaiting_approval'));
        const other = hashOf('b');

        expect(await refusalOf(approved({ patchHash: other }))).toEqual([
          409,
          {
            error: 'patch_hash_mismatch',
            message:
              `The accepted patch of the improvement ${IMPROVEMENT_ID} is ` +
              `${SEEN}, not ${other}.`,
          },
        ]);
        expectNothingChanged();
      });
    });

    describe('when the improvement waits for no approval', () => {
      it('should answer 409 status_conflict', async () => {
        await world.stored(improvementIn('completed'));

        expect(await refusalOf(approved())).toEqual([
          409,
          {
            error: 'status_conflict',
            message:
              `The improvement ${IMPROVEMENT_ID} is completed, and only one ` +
              'that awaits approval can be approved.',
          },
        ]);
        expectNothingChanged();
      });
    });

    it.each([
      ['no improvement has the id', MISSING_ID],
      ['the id is no id of an improvement', 'acme'],
    ])('should answer 404 when %s', async (_case, id) => {
      expect(await refusalOf(approved({ patchHash: SEEN }, id))).toEqual([
        404,
        { error: 'not_found', message: 'No improvement has this id.' },
      ]);
    });

    it.each([
      ['no hash', {}],
      ['a hash that is not one', { patchHash: 'abc' }],
    ])('should answer 400 for %s', async (_case, body) => {
      await world.stored(improvementIn('awaiting_approval'));

      const [status, error] = await refusalOf(approved(body));

      expect(status).toBe(400);
      expect(error.error).toBe('invalid_request');
      expectNothingChanged();
    });
  });

  describe('POST /improvements/:id/cancel', () => {
    it('should answer 202 with the improvement it cancelled', async () => {
      await world.stored(improvementIn('generating'));

      const answer = await cancelled();

      expect(answer.status).toBe(202);
      expect(improvementSchema.parse(answer.body)).toMatchObject({
        id: IMPROVEMENT_ID,
        status: 'cancelled',
        cancelledAt: world.clock.now().toString(),
      });
    });

    describe('when the improvement had ended already', () => {
      it('should answer 200 with it as it is', async () => {
        await world.stored(improvementIn('completed'));

        const answer = await cancelled();

        expect(answer.status).toBe(200);
        expect(improvementSchema.parse(answer.body).status).toBe('completed');
        expectNothingChanged();
      });
    });

    it('should answer 404 when no improvement has the id', async () => {
      expect(await refusalOf(cancelled({}, MISSING_ID))).toEqual([
        404,
        { error: 'not_found', message: 'No improvement has this id.' },
      ]);
    });

    it('should answer 400 for a body with a field', async () => {
      await world.stored(improvementIn('generating'));

      const [status, error] = await refusalOf(cancelled({ reason: 'slow' }));

      expect(status).toBe(400);
      expect(error.error).toBe('invalid_request');
      expectNothingChanged();
    });
  });
});
