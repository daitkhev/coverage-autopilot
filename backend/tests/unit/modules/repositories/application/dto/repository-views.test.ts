import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';
import { SNAPSHOT_COMMIT } from '#tests/support/coverage-snapshots';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { SCAN_ID } from '#tests/support/scan-jobs';
import { latestSnapshot } from '#tests/support/stand-in-repository-coverage';

const OTHER_COMMIT = CommitSha.create('d'.repeat(40));

let world: RepositoriesWorld;
let widgets: Repository;

/** `acme/widgets` once its head was read at the commit. */
function readAt(head: CommitSha): Repository {
  widgets.recordHead({ commit: head, readAt: world.clock.now() });
  return widgets;
}

beforeEach(async () => {
  world = new RepositoriesWorld();
  widgets = await world.connected();
});

describe('RepositoryViews', () => {
  describe('viewOf', () => {
    it('should give the repository as values with what the coverage module knows of it', async () => {
      world.coverage.answer = {
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
      };

      const view = await world.views.viewOf(widgets);

      expect(view).toEqual({
        id: WIDGETS_ID,
        owner: 'acme',
        name: 'widgets',
        url: 'https://github.com/acme/widgets',
        defaultBranch: 'main',
        connectedAt: world.clock.now(),
        headCommit: null,
        headCheckedAt: null,
        latestSnapshot: latestSnapshot(),
        activeScanId: SCAN_ID,
        outdated: false,
        threshold: { metric: 'lines', percentage: 80, isDefault: true },
        install: { mode: 'sandboxed', isDefault: true },
      });
      expect(world.coverage.asked).toEqual([WIDGETS_ID]);
    });

    it('should ask the coverage module with the threshold the view shows', async () => {
      widgets.changeThreshold(ThresholdPercentage.create(95));
      const given: RepositoryDto[] = [];
      world.coverage.coverageOf = async (repository) => {
        given.push(repository);
        return Promise.resolve(world.coverage.answer);
      };

      const view = await world.views.viewOf(widgets);

      expect(view.threshold).toEqual({
        metric: 'lines',
        percentage: 95,
        isDefault: false,
      });
      expect(given.map(({ threshold }) => threshold)).toEqual([view.threshold]);
    });

    it('should add no snapshot and no scan before the first', async () => {
      const view = await world.views.viewOf(widgets);

      expect(view).toMatchObject({
        latestSnapshot: null,
        activeScanId: null,
        outdated: false,
      });
    });

    describe('when the head was read', () => {
      beforeEach(() => {
        world.coverage.answer = {
          latestSnapshot: latestSnapshot(),
          activeScanId: null,
        };
      });

      it('should not be outdated at the commit of the newest snapshot', async () => {
        const view = await world.views.viewOf(
          readAt(CommitSha.create(SNAPSHOT_COMMIT)),
        );

        expect(view.outdated).toBe(false);
      });

      it('should be outdated when the head moved past it', async () => {
        const view = await world.views.viewOf(readAt(OTHER_COMMIT));

        expect(view.outdated).toBe(true);
        expect(view.headCommit).toBe(OTHER_COMMIT);
      });

      it('should not be outdated with no snapshot to compare', async () => {
        world.coverage.answer = { latestSnapshot: null, activeScanId: null };

        const view = await world.views.viewOf(readAt(OTHER_COMMIT));

        expect(view.outdated).toBe(false);
      });
    });
  });
});
