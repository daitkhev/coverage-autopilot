import { beforeEach, describe, expect, it } from 'vitest';

import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCRIPTED_HEAD } from '#tests/support/scripted-git';

let world: RepositoriesWorld;

beforeEach(() => {
  world = new RepositoriesWorld();
});

describe('GetRepositoryHandler', () => {
  describe('execute', () => {
    it('should give the repository as values, with its head', async () => {
      const repository = await world.connected();
      repository.recordHead({
        commit: SCRIPTED_HEAD,
        readAt: world.clock.now(),
      });

      expect(
        await world.getRepository.execute({ repositoryId: WIDGETS_ID }),
      ).toEqual({
        id: WIDGETS_ID,
        owner: 'acme',
        name: 'widgets',
        url: 'https://github.com/acme/widgets',
        defaultBranch: 'main',
        connectedAt: world.clock.now(),
        headCommit: SCRIPTED_HEAD,
        headCheckedAt: world.clock.now(),
      });
    });

    it('should answer an id no repository has with null', async () => {
      expect(
        await world.getRepository.execute({
          repositoryId: RepositoryId.create(
            '00000000-0000-4000-8000-0000000000ff',
          ),
        }),
      ).toBeNull();
    });
  });
});
