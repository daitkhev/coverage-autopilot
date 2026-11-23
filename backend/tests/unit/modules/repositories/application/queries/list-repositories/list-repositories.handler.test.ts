import { beforeEach, describe, expect, it } from 'vitest';

import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCAN_ID } from '#tests/support/scan-jobs';

let world: RepositoriesWorld;

beforeEach(() => {
  world = new RepositoriesWorld();
});

describe('ListRepositoriesHandler', () => {
  describe('execute', () => {
    it('should give every connected repository with what the coverage module knows of it', async () => {
      await world.connected();
      world.coverage.answer = { latestSnapshot: null, activeScanId: SCAN_ID };

      const listed = await world.listRepositories.execute();

      expect(listed.map((repository) => repository.id)).toEqual([WIDGETS_ID]);
      expect(listed[0]).toMatchObject({
        headCommit: null,
        activeScanId: SCAN_ID,
        outdated: false,
      });
      expect(world.coverage.asked).toEqual([WIDGETS_ID]);
    });

    it('should give an empty list when nothing is connected', async () => {
      expect(await world.listRepositories.execute()).toEqual([]);
    });
  });
});
