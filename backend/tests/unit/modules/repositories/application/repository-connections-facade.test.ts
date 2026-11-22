import { beforeEach, describe, expect, it } from 'vitest';

import { RepositoryConnectionsFacade } from '#repositories/application/repository-connections-facade';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';

const NEVER = new AbortController().signal;

let world: RepositoriesWorld;
let facade: RepositoryConnectionsFacade;

beforeEach(() => {
  world = new RepositoriesWorld();
  facade = new RepositoryConnectionsFacade(
    world.connect,
    world.listRepositories,
  );
});

describe('RepositoryConnectionsFacade', () => {
  describe('connectRepository', () => {
    it('should connect the repository of the address', async () => {
      const result = await facade.connectRepository(
        { url: 'https://github.com/acme/shop' },
        NEVER,
      );

      expect(result).toMatchObject({
        outcome: 'connected',
        repository: { owner: 'acme', name: 'shop' },
      });
      expect(world.git.calls).toEqual(['readDefaultBranch acme/shop']);
    });
  });

  describe('listRepositories', () => {
    it('should give every connected repository', async () => {
      await world.connected();

      const listed = await facade.listRepositories();

      expect(listed.map((repository) => repository.id)).toEqual([WIDGETS_ID]);
    });
  });
});
