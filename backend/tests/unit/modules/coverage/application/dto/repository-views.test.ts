import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { Instant } from '#kernel/time/instant';
import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';
import {
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  snapshotOf,
} from '#tests/support/coverage-snapshots';
import {
  heldBy,
  type RepositoryViewWorld,
  repositoryViewWorld,
} from '#tests/support/repository-view-world';
import {
  endedScanJob,
  queuedScanJob,
  runningScanJob,
  SCAN_ID,
} from '#tests/support/scan-jobs';

const NEWER_ID = '00000000-0000-4000-8000-0000000000ab';

const OTHER_COMMIT = CommitSha.create('d'.repeat(40));

let world: RepositoryViewWorld;
let widgets: RepositoryDto;

/** `acme/widgets` with the head it was last read at. */
function readAt(head: CommitSha): RepositoryDto {
  return {
    ...widgets,
    headCommit: head,
    headCheckedAt: Instant.parse('2026-03-05T00:00:00.000Z'),
  };
}

beforeEach(() => {
  world = repositoryViewWorld();
  widgets = heldBy(world.repositories);
});

describe('RepositoryViews', () => {
  describe('viewOf', () => {
    it('should keep the repository and add no snapshot and no scan before the first', async () => {
      const view = await world.views.viewOf(widgets);

      expect(view).toEqual({
        ...widgets,
        latestSnapshot: null,
        activeScanId: null,
        outdated: false,
      });
    });

    it('should add the newest snapshot under the threshold of the settings', async () => {
      world.snapshots.saved.push(
        fixtureSnapshot(),
        fixtureSnapshot({
          id: NEWER_ID,
          originKey: 'scan:newer',
          capturedAt: '2026-03-04T06:00:00.000Z',
        }),
      );

      const view = await world.views.viewOf(widgets);

      expect(view.latestSnapshot).toMatchObject({
        id: NEWER_ID,
        repositoryId: widgets.id,
        threshold: { metric: 'lines', percentage: 80 },
        files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
      });
    });

    it.each([
      ['queued', queuedScanJob()],
      ['running', runningScanJob()],
    ])('should name the scan that is %s', async (_status, job) => {
      world.queue.jobs.set(SCAN_ID, job);

      expect((await world.views.viewOf(widgets)).activeScanId).toBe(SCAN_ID);
    });

    it('should name no scan once its scan ended', async () => {
      world.queue.jobs.set(SCAN_ID, endedScanJob('cancelled'));

      expect((await world.views.viewOf(widgets)).activeScanId).toBeNull();
    });

    describe('when the head was read', () => {
      it('should not be outdated at the commit of the newest snapshot', async () => {
        world.snapshots.saved.push(snapshotOf());

        const view = await world.views.viewOf(
          readAt(CommitSha.create(SNAPSHOT_COMMIT)),
        );

        expect(view.outdated).toBe(false);
      });

      it('should be outdated when the head moved past it', async () => {
        world.snapshots.saved.push(snapshotOf());

        const view = await world.views.viewOf(readAt(OTHER_COMMIT));

        expect(view.outdated).toBe(true);
        expect(view.headCommit).toBe(OTHER_COMMIT);
      });

      it('should not be outdated with no snapshot to compare', async () => {
        const view = await world.views.viewOf(readAt(OTHER_COMMIT));

        expect(view.outdated).toBe(false);
      });
    });

    it('should read the snapshots of its own repository alone', async () => {
      world.snapshots.saved.push(
        snapshotOf({
          repositoryId: '00000000-0000-4000-8000-0000000000cc',
        }),
      );

      const view = await world.views.viewOf(widgets);

      expect(view.latestSnapshot).toBeNull();
      expect(view.id.value).toBe(REPOSITORY_ID);
    });
  });
});
