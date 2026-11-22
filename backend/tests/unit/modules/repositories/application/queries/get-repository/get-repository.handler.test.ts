import { beforeEach, describe, expect, it } from 'vitest';

import { RepositoryId } from '#kernel/primitives/repository-id';
import { GetRepositoryHandler } from '#repositories/application/queries/get-repository/get-repository.handler';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';
import { DEFAULT_TEST_THRESHOLD } from '#tests/support/coverage-snapshots';
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
        threshold: { metric: 'lines', percentage: 80, isDefault: true },
        install: { mode: 'sandboxed', isDefault: true },
      });
    });

    describe('when the repository has a threshold of its own', () => {
      it('should give that percent of the metric of the service', async () => {
        const repository = await world.connected();
        repository.changeThreshold(ThresholdPercentage.create(95));

        const found = await world.getRepository.execute({
          repositoryId: WIDGETS_ID,
        });

        expect(found?.threshold).toEqual({
          metric: 'lines',
          percentage: 95,
          isDefault: false,
        });
      });
    });

    describe('when the repository chose how it is installed', () => {
      it('should give its own mode, even one equal to the default', async () => {
        const repository = await world.connected();
        repository.changeInstallMode('sandboxed');

        const found = await world.getRepository.execute({
          repositoryId: WIDGETS_ID,
        });

        expect(found?.install).toEqual({ mode: 'sandboxed', isDefault: false });
      });
    });

    describe('when the service trusts a repository that chose nothing', () => {
      it('should give the default of the service', async () => {
        await world.connected();
        const handler = new GetRepositoryHandler(
          world.repositories,
          DEFAULT_TEST_THRESHOLD,
          { mode: 'trusted' },
        );

        const found = await handler.execute({ repositoryId: WIDGETS_ID });

        expect(found?.install).toEqual({ mode: 'trusted', isDefault: true });
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
