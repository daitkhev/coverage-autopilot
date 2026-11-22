import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { snapshotFilesSchema } from '@coverage-autopilot/api-contracts/snapshots';

import { SnapshotFilesController } from '#improvement/presentation/http/snapshot-files.controller';
import type { HttpService } from '#tests/support/http-service';
import { improvementIn } from '#tests/support/improvement-journeys';
import {
  NO_CODE_FILE,
  UNMEASURED_FILE,
} from '#tests/support/improvement-request-stand-ins';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { improvementRoutes } from '#tests/support/improvement-routes';
import {
  IMPROVEMENT_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

let world: ImprovementRequestWorld;
let service: HttpService;

beforeEach(async () => {
  world = new ImprovementRequestWorld();
  service = await improvementRoutes(world, SnapshotFilesController);
});

afterEach(async () => {
  await service.close();
});

async function filesOf(id = SOURCE_SNAPSHOT_ID, query = '') {
  return service.send('GET', `/snapshots/${id}/files${query}`);
}

describe('SnapshotFilesController', () => {
  describe('GET /snapshots/:id/files', () => {
    it('should answer 200 with every file in the words of the contract', async () => {
      await world.stored(improvementIn('completed'));

      const answer = await filesOf();

      expect(answer.status).toBe(200);
      const files = snapshotFilesSchema.parse(answer.body);
      expect(files.snapshotId).toBe(SOURCE_SNAPSHOT_ID);
      expect(files.items.map(({ path }) => path)).toEqual([
        TARGET_FILE,
        NO_CODE_FILE,
        UNMEASURED_FILE,
      ]);
      expect(files.items[0]).toMatchObject({
        state: 'measured',
        latestImprovement: { id: IMPROVEMENT_ID, status: 'completed' },
      });
    });

    it('should hand the filters of the query to coverage, the number read', async () => {
      await filesOf(SOURCE_SNAPSHOT_ID, '?below=50&metric=branches');

      expect(world.coverage.asked.at(-1)).toEqual({
        snapshotId: SOURCE_SNAPSHOT_ID,
        below: 50,
        metric: 'branches',
      });
    });

    it.each([
      ['no snapshot has the id', MISSING_ID],
      ['the id is no id of a snapshot', 'latest'],
    ])('should answer 404 when %s', async (_case, id) => {
      world.coverage.snapshot = null;

      const answer = await filesOf(id);

      expect(answer.status).toBe(404);
      expect(errorSchema.parse(answer.body)).toEqual({
        error: 'not_found',
        message: 'No snapshot has this id.',
      });
    });

    it.each([
      ['a percentage that is no number', '?below=abc'],
      ['a percentage above 100', '?below=101'],
      ['a state the contract does not have', '?state=broken'],
      ['a filter the contract does not have', '?owner=acme'],
    ])('should answer 400 for %s', async (_case, query) => {
      const answer = await filesOf(SOURCE_SNAPSHOT_ID, query);

      expect(answer.status).toBe(400);
      expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      expect(world.coverage.asked).toEqual([]);
    });
  });
});
