import { beforeEach, describe, expect, it } from 'vitest';

import { ListSnapshotsHandler } from '#coverage/application/queries/list-snapshots/list-snapshots.handler';
import { InvalidRepositoryIdError } from '#kernel/errors/invalid-repository-id.error';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import {
  CAPTURED_AT,
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
  snapshotOf,
} from '#tests/support/coverage-snapshots';
import { inMemorySnapshots } from '#tests/support/coverage-stand-ins';
import { COVERAGE_TEST_SETTINGS } from '#tests/support/recording-sandbox';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

const LATER_ID = '00000000-0000-4000-8000-0000000000a1';
const ELSEWHERE_ID = '00000000-0000-4000-8000-0000000000a2';
const OTHER_REPOSITORY_ID = '00000000-0000-4000-8000-0000000000a3';
const NEVER_SCANNED_ID = '00000000-0000-4000-8000-0000000000a4';
const LATER = '2026-03-05T05:06:07.008Z';

let repositories: StandInRepositories;
let handler: ListSnapshotsHandler;

beforeEach(() => {
  repositories = standInRepositories();
  const snapshots = inMemorySnapshots(
    fixtureSnapshot(),
    snapshotOf({ id: LATER_ID, originKey: 'scan:later', capturedAt: LATER }),
    snapshotOf({
      id: ELSEWHERE_ID,
      originKey: 'scan:elsewhere',
      repositoryId: OTHER_REPOSITORY_ID,
    }),
  );
  handler = new ListSnapshotsHandler(
    repositories,
    snapshots,
    COVERAGE_TEST_SETTINGS,
  );
});

describe('ListSnapshotsHandler', () => {
  describe('execute', () => {
    it('should list the snapshots of the repository, the newest first', async () => {
      const listed = await handler.execute({ repositoryId: REPOSITORY_ID });

      expect(listed?.map(({ id }) => id)).toEqual([LATER_ID, SNAPSHOT_ID]);
    });

    it('should give each its totals and its files under the threshold', async () => {
      const listed = await handler.execute({ repositoryId: REPOSITORY_ID });

      expect(listed?.[1]).toMatchObject({
        id: SNAPSHOT_ID,
        repositoryId: RepositoryId.create(REPOSITORY_ID),
        commit: CommitSha.create(SNAPSHOT_COMMIT),
        capturedAt: Instant.parse(CAPTURED_AT),
        project: {
          packageManager: 'npm',
          configFile: { value: 'jest.config.json' },
        },
        parameters: { testRunner: 'jest', coverageProvider: 'babel' },
        totals: { lines: { covered: 2, total: 6 } },
        threshold: { metric: 'lines', percentage: 80 },
        files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
      });
    });

    describe('when the repository was never scanned', () => {
      it('should answer an empty list', async () => {
        const listed = await handler.execute({
          repositoryId: NEVER_SCANNED_ID,
        });

        expect(listed).toEqual([]);
      });
    });

    describe('when no repository has the id', () => {
      it('should answer null', async () => {
        repositories.repository = null;

        await expect(
          handler.execute({ repositoryId: REPOSITORY_ID }),
        ).resolves.toBeNull();
      });
    });

    describe('when the id is not the id of a repository', () => {
      it('should throw the error of a repository id', async () => {
        await expect(handler.execute({ repositoryId: 'acme' })).rejects.toThrow(
          InvalidRepositoryIdError,
        );
      });
    });
  });
});
