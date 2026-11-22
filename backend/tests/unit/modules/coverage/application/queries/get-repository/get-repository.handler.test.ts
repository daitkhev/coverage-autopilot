import { beforeEach, describe, expect, it } from 'vitest';

import { GetRepositoryHandler } from '#coverage/application/queries/get-repository/get-repository.handler';
import { REPOSITORY_ID, snapshotOf } from '#tests/support/coverage-snapshots';
import {
  type RepositoryViewWorld,
  repositoryViewWorld,
} from '#tests/support/repository-view-world';

let world: RepositoryViewWorld;
let handler: GetRepositoryHandler;

beforeEach(() => {
  world = repositoryViewWorld();
  handler = new GetRepositoryHandler(world.repositories, world.views);
});

describe('GetRepositoryHandler', () => {
  describe('execute', () => {
    it('should give the repository with what the coverage module knows of it', async () => {
      world.snapshots.saved.push(snapshotOf());

      const view = await handler.execute({ repositoryId: REPOSITORY_ID });

      expect(view).toMatchObject({
        owner: 'acme',
        name: 'widgets',
        latestSnapshot: { id: snapshotOf().id.value },
        activeScanId: null,
        outdated: false,
      });
    });

    describe('when no repository has the id', () => {
      it('should give null', async () => {
        world.repositories.repository = null;

        expect(
          await handler.execute({ repositoryId: REPOSITORY_ID }),
        ).toBeNull();
      });

      it('should give null for a text that is no id', async () => {
        expect(
          await handler.execute({ repositoryId: 'acme-widgets' }),
        ).toBeNull();
      });
    });
  });
});
