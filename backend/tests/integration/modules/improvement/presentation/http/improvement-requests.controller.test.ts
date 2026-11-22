import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ErrorBody,
  errorSchema,
} from '@coverage-autopilot/api-contracts/errors';
import { improvementSchema } from '@coverage-autopilot/api-contracts/improvements';

import { ImprovementRequestsController } from '#improvement/presentation/http/improvement-requests.controller';
import type { HttpService } from '#tests/support/http-service';
import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import {
  FIRST_KEY,
  improvementRoutes,
} from '#tests/support/improvement-routes';
import {
  BASE_COMMIT,
  hashOf,
  IMPROVEMENT_ID,
  REPOSITORY_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';

const FIRST_ID = '00000000-0000-4000-8000-000000000001';

const REQUEST = { snapshotId: SOURCE_SNAPSHOT_ID, filePath: TARGET_FILE };

let world: ImprovementRequestWorld;
let service: HttpService;

beforeEach(async () => {
  world = new ImprovementRequestWorld();
  service = await improvementRoutes(world, ImprovementRequestsController);
});

afterEach(async () => {
  await service.close();
});

async function requested(body: unknown = REQUEST) {
  return service.send('POST', '/improvements', { body, headers: FIRST_KEY });
}

/** The status and the error of an answer that is not a success. */
async function refusalOf(
  answer: ReturnType<typeof requested>,
): Promise<[number, ErrorBody]> {
  const { status, body } = await answer;
  return [status, errorSchema.parse(body)];
}

describe('ImprovementRequestsController', () => {
  describe('POST /improvements', () => {
    it('should answer 202 with the new improvement in the words of the contract', async () => {
      const answer = await requested();

      expect(answer.status).toBe(202);
      expect(improvementSchema.parse(answer.body)).toMatchObject({
        id: FIRST_ID,
        repositoryId: REPOSITORY_ID,
        sourceSnapshotId: SOURCE_SNAPSHOT_ID,
        baseCommit: BASE_COMMIT,
        targetFile: TARGET_FILE,
        status: 'created',
        waitingFor: 'worker',
        createdAt: world.clock.now().toString(),
        attempts: [],
      });
    });

    it('should hand the signal of the request to the use case', async () => {
      const execute = vi.spyOn(world.start, 'execute');

      await requested();

      expect(execute.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    });

    describe('when the same key asks for the same work again', () => {
      it('should answer 200 with the improvement made before', async () => {
        await requested();

        const again = await requested();

        expect(again.status).toBe(200);
        expect(improvementSchema.parse(again.body).id).toBe(FIRST_ID);
        expect(world.improvements.writes).toHaveLength(1);
      });
    });

    describe('when the request does not match its schema', () => {
      it.each([
        ['a field is missing', { snapshotId: SOURCE_SNAPSHOT_ID }],
        ['a field is not known', { ...REQUEST, priority: 'high' }],
        ['a path leaves the repository', { ...REQUEST, filePath: '../x.ts' }],
      ])('should answer 400 when %s', async (_case, body) => {
        const [status, error] = await refusalOf(requested(body));

        expect(status).toBe(400);
        expect(error.error).toBe('invalid_request');
        expect(world.coverage.asked).toEqual([]);
      });

      it('should answer 400 for a request without a key', async () => {
        const answer = await service.send('POST', '/improvements', {
          body: REQUEST,
        });

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      });
    });

    describe('when a value breaks a rule the schema does not hold', () => {
      it.each([
        [
          'a budget above the maximum',
          { budget: { attempts: 11 } },
          'The budget asks for 11 of attempts, and the service allows 10.',
        ],
        [
          'a quality policy the gate cannot judge by',
          {
            qualityPolicy: {
              requiredChecks: ['type_check'],
              repeatedRuns: 3,
              mutationThreshold: 60,
            },
          },
          'The quality policy does not require test_files_only, without ' +
            'which the gate applies no patch.',
        ],
      ])('should answer 400 for %s', async (_case, choice, message) => {
        const refusal = await refusalOf(requested({ ...REQUEST, ...choice }));

        expect(refusal).toEqual([400, { error: 'invalid_request', message }]);
        expect(world.coverage.asked).toEqual([]);
      });
    });

    describe('when the snapshot is not there', () => {
      it('should answer 404 and say it is the snapshot', async () => {
        world.coverage.snapshot = null;

        expect(await refusalOf(requested())).toEqual([
          404,
          {
            error: 'not_found',
            message: `No snapshot has the id ${SOURCE_SNAPSHOT_ID}.`,
          },
        ]);
      });
    });

    describe('when the snapshot did not measure the file', () => {
      it('should answer 404 and say it is the file', async () => {
        world.coverage.file = null;

        expect(await refusalOf(requested())).toEqual([
          404,
          {
            error: 'not_found',
            message:
              `${TARGET_FILE} is not a measured file of the snapshot ` +
              `${SOURCE_SNAPSHOT_ID}.`,
          },
        ]);
      });
    });

    describe('when the file changed on the default branch', () => {
      it('should answer 409 stale_snapshot', async () => {
        world.repositories.assessment = 'stale';

        const [status, error] = await refusalOf(requested());

        expect(status).toBe(409);
        expect(error.error).toBe('stale_snapshot');
        expect(error.improvementId).toBeUndefined();
      });
    });

    describe('when earlier work stands in the way', () => {
      it.each([
        [
          'improvement_in_progress',
          improvementIn('generating', {
            key: 'request-9',
            fingerprint: hashOf('e'),
          }),
        ],
        [
          'work_already_requested',
          improvementIn('completed', { key: 'request-9' }),
        ],
        [
          'request_key_reused',
          improvementIn('generating', { fingerprint: hashOf('e') }),
        ],
      ] as const)(
        'should answer 409 %s with the id of that improvement',
        async (code, earlier) => {
          await world.stored(earlier);

          const [status, error] = await refusalOf(requested());

          expect(status).toBe(409);
          expect(error).toMatchObject({
            error: code,
            improvementId: IMPROVEMENT_ID,
          });
          expect(world.improvements.writes).toEqual([]);
        },
      );
    });
  });
});
