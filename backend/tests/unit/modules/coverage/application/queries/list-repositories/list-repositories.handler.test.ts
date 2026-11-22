import { beforeEach, describe, expect, it } from 'vitest';

import { ListRepositoriesHandler } from '#coverage/application/queries/list-repositories/list-repositories.handler';
import { REPOSITORY_ID } from '#tests/support/coverage-snapshots';
import {
  type RepositoryViewWorld,
  repositoryViewWorld,
} from '#tests/support/repository-view-world';
import { queuedScanJob, SCAN_ID } from '#tests/support/scan-jobs';

let world: RepositoryViewWorld;
let handler: ListRepositoriesHandler;

beforeEach(() => {
  world = repositoryViewWorld();
  handler = new ListRepositoriesHandler(world.connections, world.views);
});

describe('ListRepositoriesHandler', () => {
  describe('execute', () => {
    it('should give every connected repository as it is seen', async () => {
      world.queue.jobs.set(SCAN_ID, queuedScanJob());

      const views = await handler.execute();

      expect(views).toHaveLength(1);
      expect(views[0]).toMatchObject({
        latestSnapshot: null,
        activeScanId: SCAN_ID,
        outdated: false,
      });
      expect(views[0]?.id.value).toBe(REPOSITORY_ID);
    });

    it('should give an empty list when nothing is connected', async () => {
      world.repositories.repository = null;

      expect(await handler.execute()).toEqual([]);
    });
  });
});
