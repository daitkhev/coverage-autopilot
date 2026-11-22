import { beforeEach, describe, expect, it } from 'vitest';

import { GetSnapshotHandler } from '#coverage/application/queries/get-snapshot/get-snapshot.handler';
import { RepositoryThresholds } from '#coverage/application/repository-thresholds';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import {
  CAPTURED_AT,
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import { inMemorySnapshots } from '#tests/support/coverage-stand-ins';
import {
  judgeBy,
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

let repositories: StandInRepositories;
let handler: GetSnapshotHandler;

beforeEach(() => {
  repositories = standInRepositories();
  handler = new GetSnapshotHandler(
    inMemorySnapshots(fixtureSnapshot()),
    new RepositoryThresholds(repositories),
  );
});

describe('GetSnapshotHandler', () => {
  describe('execute', () => {
    it('should give the snapshot with its totals and its split', async () => {
      const snapshot = await handler.execute({ snapshotId: SNAPSHOT_ID });

      expect(snapshot).toEqual({
        id: SNAPSHOT_ID,
        repositoryId: RepositoryId.create(REPOSITORY_ID),
        commit: CommitSha.create(SNAPSHOT_COMMIT),
        originKey: 'scan:origin',
        capturedAt: Instant.parse(CAPTURED_AT),
        project: {
          testRunner: 'jest',
          testRunnerVersion: '30.5.2',
          packageManager: 'npm',
          configFile: FilePath.create('jest.config.json'),
        },
        parameters: {
          testRunner: 'jest',
          testRunnerVersion: '30.5.2',
          coverageProvider: 'babel',
          fileListRule: 'default-sources-v1',
        },
        totals: {
          statements: { covered: 2, total: 7, percentage: 200 / 7 },
          branches: { covered: 1, total: 2, percentage: 50 },
          functions: { covered: 1, total: 3, percentage: 100 / 3 },
          lines: { covered: 2, total: 6, percentage: 100 / 3 },
        },
        threshold: { metric: 'lines', percentage: 80 },
        files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
        testRunOutput: null,
      });
    });

    describe('when the repository has a threshold of its own', () => {
      it('should split the files under it', async () => {
        judgeBy(repositories, 30);

        const snapshot = await handler.execute({ snapshotId: SNAPSHOT_ID });

        expect(snapshot).toMatchObject({
          threshold: { metric: 'lines', percentage: 30 },
          files: { below: 1, above: 1 },
        });
      });
    });

    describe('when no snapshot has the id', () => {
      it('should answer null', async () => {
        const snapshot = await handler.execute({
          snapshotId: '00000000-0000-4000-8000-0000000000cc',
        });

        expect(snapshot).toBeNull();
      });
    });
  });
});
