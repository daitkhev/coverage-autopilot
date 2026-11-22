import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { Instant } from '#kernel/time/instant';
import { RepositoryNotFoundError } from '#repositories/application/errors/repository-not-found.error';
import { Repository } from '#repositories/domain/entities/repository.entity';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { STORED_TIME } from '#tests/support/schema-rows';

const HEAD = {
  commit: CommitSha.create('b'.repeat(40)),
  readAt: Instant.parse(STORED_TIME),
};

let world: RepositoriesWorld;

beforeEach(() => {
  world = new RepositoriesWorld();
});

describe('HeadRecorder', () => {
  describe('record', () => {
    it('should keep the head in one transaction', async () => {
      const repository = await world.connected();

      await world.heads.record(repository, HEAD);

      const [save, ...others] = world.repositories.saves;
      expect(save?.repository.head).toBe(HEAD);
      expect(save?.transaction).toBe(world.transactions.transaction);
      expect(others).toEqual([]);
      expect(world.transactions.runs).toBe(1);
    });

    describe('when a threshold was set while the host was asked', () => {
      it('should keep that threshold beside the head', async () => {
        const read = await world.connected();
        const changed = Repository.restore(WIDGETS_ID, {
          url: read.url,
          defaultBranch: read.defaultBranch,
          connectedAt: read.connectedAt,
          head: null,
          threshold: ThresholdPercentage.create(95),
        });
        await world.repositories.save(changed, world.transactions.transaction);

        await world.heads.record(read, HEAD);

        const kept = await world.repositories.findById(WIDGETS_ID);
        expect(kept?.threshold?.value).toBe(95);
        expect(kept?.head).toBe(HEAD);
      });
    });

    describe('when the repository is not connected', () => {
      it('should throw RepositoryNotFoundError and keep nothing', async () => {
        const unknown = Repository.connect(WIDGETS_ID, {
          url: RepositoryUrl.parse('https://github.com/acme/gadgets'),
          defaultBranch: BranchName.create('main'),
          connectedAt: Instant.parse(STORED_TIME),
        });

        await expect(world.heads.record(unknown, HEAD)).rejects.toThrow(
          RepositoryNotFoundError,
        );
        expect(world.repositories.saves).toEqual([]);
      });
    });
  });
});
