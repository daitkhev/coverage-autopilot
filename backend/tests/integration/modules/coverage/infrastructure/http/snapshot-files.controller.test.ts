import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { snapshotFilesSchema } from '@coverage-autopilot/api-contracts/snapshots';

import { ListSnapshotFilesHandler } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.handler';
import { RepositoryThresholds } from '#coverage/application/repository-thresholds';
import { SnapshotFilesController } from '#coverage/infrastructure/http/snapshot-files.controller';
import {
  fixtureSnapshot,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import { inMemorySnapshots } from '#tests/support/coverage-stand-ins';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import {
  type StandInFileImprovements,
  standInFileImprovements,
  USED_IMPROVEMENT_ID,
  usedFileImproved,
} from '#tests/support/stand-in-file-improvements';
import { standInRepositories } from '#tests/support/stand-in-repositories';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

let improvements: StandInFileImprovements;
let service: HttpService;

beforeEach(async () => {
  improvements = standInFileImprovements();
  const handler = new ListSnapshotFilesHandler(
    inMemorySnapshots(fixtureSnapshot()),
    new RepositoryThresholds(standInRepositories()),
    improvements,
  );
  service = await startHttpService({
    controllers: [SnapshotFilesController],
    providers: [{ provide: ListSnapshotFilesHandler, useValue: handler }],
  });
});

afterEach(async () => {
  await service.close();
});

async function filesOf(id = SNAPSHOT_ID, query = '') {
  return service.send('GET', `/snapshots/${id}/files${query}`);
}

describe('SnapshotFilesController', () => {
  describe('GET /snapshots/:id/files', () => {
    it('should answer 200 with every file in the words of the contract', async () => {
      improvements.latest = [usedFileImproved()];

      const answer = await filesOf();

      expect(answer.status).toBe(200);
      const files = snapshotFilesSchema.parse(answer.body);
      expect(files.snapshotId).toBe(SNAPSHOT_ID);
      expect(files.items.map(({ path }) => path)).toEqual([
        'src/unused.ts',
        'src/used.ts',
        'src/broken.ts',
        'src/types.ts',
      ]);
      expect(files.items[1]).toMatchObject({
        path: 'src/used.ts',
        state: 'measured',
        coverage: {
          branches: { covered: 1, total: 2, percentage: 50 },
          lines: { covered: 2, total: 5, percentage: 40 },
        },
        belowThreshold: true,
        uncoveredLines: [{ start: 6, end: 9 }],
        openBranchLines: [6],
        uncoveredFunctions: [{ name: 'halve', line: 5 }],
        latestImprovement: { id: USED_IMPROVEMENT_ID, status: 'completed' },
      });
      expect(files.items[2]).toEqual({
        path: 'src/broken.ts',
        state: 'unmeasured',
        reason: 'parse_failed',
        toolMessage: "')' expected.",
      });
    });

    it('should narrow the files by the filters of the query, the number read', async () => {
      const answer = await filesOf(SNAPSHOT_ID, '?below=60&metric=branches');

      const files = snapshotFilesSchema.parse(answer.body);
      expect(files.threshold).toEqual({ metric: 'branches', percentage: 60 });
      expect(files.items.map(({ path }) => path)).toEqual(['src/used.ts']);
    });

    it.each([
      ['no snapshot has the id', MISSING_ID],
      ['the id is no id of a snapshot', 'latest'],
    ])('should answer 404 when %s', async (_case, id) => {
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
      const answer = await filesOf(SNAPSHOT_ID, query);

      expect(answer.status).toBe(400);
      expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      expect(improvements.asked).toEqual([]);
    });
  });
});
