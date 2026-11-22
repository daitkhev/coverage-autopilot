import { beforeEach, describe, expect, it } from 'vitest';

import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCAN_ID } from '#tests/support/scan-jobs';
import { latestSnapshot } from '#tests/support/stand-in-repository-coverage';

let world: RepositoriesWorld;

beforeEach(async () => {
  world = new RepositoriesWorld();
  await world.connected();
});

describe('GetRepositoryViewHandler', () => {
  describe('execute', () => {
    it('should give the repository the route names with what the coverage module knows of it', async () => {
      world.coverage.answer = {
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
      };

      const view = await world.getRepositoryView.execute({
        repositoryId: WIDGETS_ID.value,
      });

      expect(view).toMatchObject({
        id: WIDGETS_ID,
        owner: 'acme',
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
      });
      expect(world.coverage.asked).toEqual([WIDGETS_ID]);
    });

    it.each([
      ['an id no repository has', '00000000-0000-4000-8000-0000000000ff'],
      ['a text that is no id', 'acme-widgets'],
    ])('should answer %s with null and ask nothing more', async (_case, id) => {
      expect(
        await world.getRepositoryView.execute({ repositoryId: id }),
      ).toBeNull();
      expect(world.coverage.asked).toEqual([]);
    });
  });
});
