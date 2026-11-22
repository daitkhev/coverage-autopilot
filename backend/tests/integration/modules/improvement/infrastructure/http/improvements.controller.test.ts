import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  improvementListSchema,
  improvementPatchSchema,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import { improvementStatusSchema } from '@coverage-autopilot/api-contracts/statuses';

import { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import { ImprovementsController } from '#improvement/infrastructure/http/improvements.controller';
import { IN_MEMORY_ARTIFACTS_FOLDER } from '#tests/support/coverage-stand-ins';
import type { HttpService } from '#tests/support/http-service';
import {
  improvementIn,
  WINDOW_OPENS_AT,
} from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { improvementRoutes } from '#tests/support/improvement-routes';
import {
  failedRunReportProps,
  hashOf,
  IMPROVEMENT_ID,
  minutesIn,
  patchOf,
  REPOSITORY_ID,
  RUN_FAILURE,
} from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

/** A second improvement, of another file, that sorts before the first. */
const TAX = {
  id: '00000000-0000-4000-8000-000000000202',
  key: 'request-2',
  fingerprint: hashOf('2'),
  targetFile: 'src/tax.ts',
};

let world: ImprovementRequestWorld;
let service: HttpService;

beforeEach(async () => {
  world = new ImprovementRequestWorld();
  service = await improvementRoutes(world, ImprovementsController);
});

afterEach(async () => {
  await service.close();
});

/** The ids of a list the route answered, as the contract reads them. */
async function listed(query = ''): Promise<string[]> {
  const answer = await service.send('GET', `/improvements${query}`);
  expect(answer.status).toBe(200);
  return improvementListSchema.parse(answer.body).items.map(({ id }) => id);
}

async function shown(id = IMPROVEMENT_ID) {
  const answer = await service.send('GET', `/improvements/${id}`);
  return {
    status: answer.status,
    improvement: improvementSchema.parse(answer.body),
  };
}

describe('ImprovementsController', () => {
  describe('GET /improvements', () => {
    beforeEach(async () => {
      const tax = improvementIn('analyzing', TAX);
      await world.stored(improvementIn('completed'), tax);
    });

    it('should answer 200 with every improvement, the newest first', async () => {
      expect(await listed()).toEqual([TAX.id, IMPROVEMENT_ID]);
    });

    it.each([
      ['a status', '?status=analyzing', [TAX.id]],
      ['a file, for its history', `?filePath=${TAX.targetFile}`, [TAX.id]],
      [
        'a repository',
        `?repositoryId=${REPOSITORY_ID}`,
        [TAX.id, IMPROVEMENT_ID],
      ],
      ['a repository id no improvement can have', '?repositoryId=acme', []],
    ])('should narrow the list by %s', async (_by, query, ids) => {
      expect(await listed(query)).toEqual(ids);
    });

    describe('when the query does not match its schema', () => {
      it.each([
        ['a status the contract does not have', '?status=done'],
        ['a filter the contract does not have', '?owner=acme'],
        ['a status given twice', '?status=failed&status=completed'],
      ])('should answer 400 for %s', async (_case, query) => {
        const answer = await service.send('GET', `/improvements${query}`);

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      });
    });
  });

  describe('GET /improvements/:id', () => {
    it.each(improvementStatusSchema.options)(
      'should answer 200 with an improvement that is %s as the contract has it',
      async (status) => {
        await world.stored(improvementIn(status));

        const answer = await shown();

        expect(answer.status).toBe(200);
        expect(answer.improvement).toMatchObject({
          id: IMPROVEMENT_ID,
          status,
        });
      },
    );

    it('should give where the raw output of an attempt is kept', async () => {
      await world.stored(improvementIn('completed'));

      const { improvement } = await shown();

      expect(improvement.attempts[0]?.rawOutputPaths).toEqual([
        `${IN_MEMORY_ARTIFACTS_FOLDER}/outputs/generator.json`,
        `${IN_MEMORY_ARTIFACTS_FOLDER}/outputs/new-tests.txt`,
      ]);
    });

    it('should give what the failed run of tests said first, its file as text', async () => {
      const improvement = improvementIn('verifying');
      improvement.recordVerdict(
        VerificationReport.create(failedRunReportProps()),
        minutesIn(6),
      );
      await world.stored(improvement);

      const { improvement: answered } = await shown();

      expect(answered.attempts[0]?.report?.checks[0]?.testFailure).toEqual({
        ...RUN_FAILURE,
        file: RUN_FAILURE.file.value,
      });
    });

    it('should give every moment as the one text of the contract', async () => {
      await world.stored(improvementIn('waiting_for_limit'));
      world.queue.progress = {
        jobId: 'job-1',
        steps: [{ code: 'generate', status: 'running', done: 1, total: 3 }],
        updatedAt: minutesIn(9),
      };

      const { improvement } = await shown();

      expect(improvement).toMatchObject({
        resumesAt: WINDOW_OPENS_AT.toString(),
        progress: {
          steps: [{ code: 'generate', status: 'running', done: 1, total: 3 }],
          updatedAt: minutesIn(9).toString(),
        },
      });
    });

    it.each([
      ['no improvement has the id', MISSING_ID],
      ['the id is no id of an improvement', 'latest'],
    ])('should answer 404 when %s', async (_case, id) => {
      const answer = await service.send('GET', `/improvements/${id}`);

      expect(answer).toEqual({
        status: 404,
        body: { error: 'not_found', message: 'No improvement has this id.' },
      });
    });

    it('should answer 400 for an id longer than the contract allows', async () => {
      const answer = await service.send(
        'GET',
        `/improvements/${'a'.repeat(65)}`,
      );

      expect(answer.status).toBe(400);
      expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
    });
  });

  describe('GET /improvements/:id/patch', () => {
    it('should answer 200 with the accepted patch and its hash', async () => {
      await world.stored(improvementIn('awaiting_approval'));

      const answer = await service.send(
        'GET',
        `/improvements/${IMPROVEMENT_ID}/patch`,
      );

      expect(answer.status).toBe(200);
      expect(improvementPatchSchema.parse(answer.body)).toEqual({
        improvementId: IMPROVEMENT_ID,
        attemptNumber: 1,
        patch: patchOf().text,
        patchHash: patchOf().hash,
      });
    });

    describe('when the gate has accepted no patch', () => {
      it('should answer 409 status_conflict with the id of the improvement', async () => {
        await world.stored(improvementIn('verifying'));

        const answer = await service.send(
          'GET',
          `/improvements/${IMPROVEMENT_ID}/patch`,
        );

        expect(answer).toEqual({
          status: 409,
          body: {
            error: 'status_conflict',
            message: `The improvement ${IMPROVEMENT_ID} has no accepted patch.`,
            improvementId: IMPROVEMENT_ID,
          },
        });
      });
    });

    it('should answer 404 when no improvement has the id', async () => {
      const answer = await service.send(
        'GET',
        `/improvements/${MISSING_ID}/patch`,
      );

      expect(answer.status).toBe(404);
      expect(errorSchema.parse(answer.body).error).toBe('not_found');
    });
  });
});
