import { beforeEach, describe, expect, it } from 'vitest';

import { RepositoryCoverageApi } from '#coverage/application/repository-coverage-api';
import type { RepositoryDto } from '#repositories/application/contracts/repositories-public-api';
import { REPOSITORY_COVERAGE } from '#repositories/application/contracts/repository-coverage';
import { fixtureSnapshot, snapshotOf } from '#tests/support/coverage-snapshots';
import {
  type InMemorySnapshots,
  inMemorySnapshots,
} from '#tests/support/coverage-stand-ins';
import {
  type RecordingQueue,
  recordingQueue,
} from '#tests/support/recording-queue';
import {
  endedScanJob,
  queuedScanJob,
  runningScanJob,
  SCAN_ID,
} from '#tests/support/scan-jobs';
import {
  heldBy,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

const WIDGETS: RepositoryDto = heldBy(standInRepositories());

const NEWER_ID = '00000000-0000-4000-8000-0000000000ab';

let snapshots: InMemorySnapshots;
let queue: RecordingQueue;
let api: RepositoryCoverageApi;

beforeEach(() => {
  snapshots = inMemorySnapshots();
  queue = recordingQueue();
  api = new RepositoryCoverageApi(snapshots, queue);
});

describe('RepositoryCoverageApi', () => {
  it('should be bound by the token the repositories module injects', () => {
    expect(RepositoryCoverageApi.token).toBe(REPOSITORY_COVERAGE);
  });

  describe('coverageOf', () => {
    it('should give no snapshot and no scan before the first', async () => {
      expect(await api.coverageOf(WIDGETS)).toEqual({
        latestSnapshot: null,
        activeScanId: null,
      });
    });

    it('should give the newest snapshot under the threshold of the repository', async () => {
      snapshots.saved.push(
        fixtureSnapshot(),
        fixtureSnapshot({
          id: NEWER_ID,
          originKey: 'scan:newer',
          capturedAt: '2026-03-04T06:00:00.000Z',
        }),
      );

      const coverage = await api.coverageOf(WIDGETS);

      expect(coverage.latestSnapshot).toMatchObject({
        id: NEWER_ID,
        threshold: { metric: 'lines', percentage: 80 },
        files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
      });
    });

    it('should split the snapshot under the threshold it is given', async () => {
      snapshots.saved.push(fixtureSnapshot());

      const coverage = await api.coverageOf({
        ...WIDGETS,
        threshold: { metric: 'lines', percentage: 30, isDefault: false },
      });

      expect(coverage.latestSnapshot).toMatchObject({
        threshold: { metric: 'lines', percentage: 30 },
        files: { below: 1, above: 1 },
      });
    });

    it.each([
      ['queued', queuedScanJob()],
      ['running', runningScanJob()],
    ])('should name the scan that is %s', async (_status, job) => {
      queue.jobs.set(SCAN_ID, job);

      expect((await api.coverageOf(WIDGETS)).activeScanId).toBe(SCAN_ID);
    });

    it('should name no scan once its scan ended', async () => {
      queue.jobs.set(SCAN_ID, endedScanJob('cancelled'));

      expect((await api.coverageOf(WIDGETS)).activeScanId).toBeNull();
    });

    it('should read the snapshots of its own repository alone', async () => {
      snapshots.saved.push(
        snapshotOf({ repositoryId: '00000000-0000-4000-8000-0000000000cc' }),
      );

      expect((await api.coverageOf(WIDGETS)).latestSnapshot).toBeNull();
    });
  });
});
