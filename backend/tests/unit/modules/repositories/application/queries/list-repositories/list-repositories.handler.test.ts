import { beforeEach, describe, expect, it } from 'vitest';

import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';

let world: RepositoriesWorld;

beforeEach(() => {
  world = new RepositoriesWorld();
});

describe('ListRepositoriesHandler', () => {
  describe('execute', () => {
    it('should give every connected repository as values', async () => {
      await world.connected();

      const listed = await world.listRepositories.execute();

      expect(listed.map((repository) => repository.id)).toEqual([WIDGETS_ID]);
      expect(listed[0]?.headCommit).toBeNull();
    });

    it('should give an empty list when nothing is connected', async () => {
      expect(await world.listRepositories.execute()).toEqual([]);
    });
  });
});
