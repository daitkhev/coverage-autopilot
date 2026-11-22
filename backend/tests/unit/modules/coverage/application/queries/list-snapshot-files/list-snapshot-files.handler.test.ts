import { beforeEach, describe, expect, it } from 'vitest';

import { ListSnapshotFilesHandler } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.handler';
import type { ListSnapshotFilesQuery } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.query';
import { InvalidCoveragePercentageError } from '#coverage/domain/errors/invalid-coverage-percentage.error';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  fixtureSnapshot,
  measuredFile,
  REPOSITORY_ID,
  SNAPSHOT_ID,
  snapshotOf,
} from '#tests/support/coverage-snapshots';
import { inMemorySnapshots } from '#tests/support/coverage-stand-ins';
import { COVERAGE_TEST_SETTINGS } from '#tests/support/recording-sandbox';
import {
  type StandInFileImprovements,
  standInFileImprovements,
  USED_IMPROVEMENT_ID,
  usedFileImproved,
} from '#tests/support/stand-in-file-improvements';

const TIED_ID = '00000000-0000-4000-8000-0000000000ab';

let improvements: StandInFileImprovements;
let handler: ListSnapshotFilesHandler;

/**
 * The fixture project: `src/unused.ts` covers 0% of its lines and no
 * branch, `src/used.ts` 40% of its lines and 50% of its branches,
 * `src/broken.ts` was not measured and `src/types.ts` has no code.
 */
beforeEach(() => {
  improvements = standInFileImprovements();
  handler = new ListSnapshotFilesHandler(
    inMemorySnapshots(
      fixtureSnapshot(),
      snapshotOf({
        id: TIED_ID,
        originKey: 'scan:tied',
        files: [
          measuredFile('src/b.ts', { lines: [1, 2] }),
          measuredFile('src/a.ts', { lines: [2, 4] }),
          measuredFile('src/c.ts', { lines: [0, 2] }),
        ],
      }),
    ),
    COVERAGE_TEST_SETTINGS,
    improvements,
  );
});

async function pathsOf(
  filters: Omit<ListSnapshotFilesQuery, 'snapshotId'>,
): Promise<string[] | undefined> {
  const listed = await handler.execute({ snapshotId: SNAPSHOT_ID, ...filters });
  return listed?.items.map(({ path }) => path.value);
}

describe('ListSnapshotFilesHandler', () => {
  describe('execute', () => {
    it('should list every file, the least covered first and the files with no share after', async () => {
      const listed = await handler.execute({ snapshotId: SNAPSHOT_ID });

      expect(listed).toMatchObject({
        snapshotId: SNAPSHOT_ID,
        threshold: { metric: 'lines', percentage: 80 },
        items: [
          {
            path: { value: 'src/unused.ts' },
            state: 'measured',
            counters: {
              branches: { covered: 0, total: 0, percentage: null },
              lines: { covered: 0, total: 1, percentage: 0 },
            },
            belowThreshold: true,
          },
          {
            path: { value: 'src/used.ts' },
            state: 'measured',
            belowThreshold: true,
            uncoveredLines: [{ start: 6, end: 9 }],
            openBranchLines: [6],
            uncoveredFunctions: [{ name: 'halve', line: 5 }],
            latestImprovement: null,
          },
          {
            path: { value: 'src/broken.ts' },
            state: 'unmeasured',
            reason: 'parse_failed',
            toolMessage: "')' expected.",
          },
          { path: { value: 'src/types.ts' }, state: 'no_executable_code' },
        ],
      });
    });

    it('should list files with the same share by path', async () => {
      const listed = await handler.execute({ snapshotId: TIED_ID });

      expect(listed?.items.map(({ path }) => path.value)).toEqual([
        'src/c.ts',
        'src/a.ts',
        'src/b.ts',
      ]);
    });

    describe('with a percentage', () => {
      it('should keep the measured files below it in the metric of the settings', async () => {
        const listed = await handler.execute({
          snapshotId: SNAPSHOT_ID,
          below: 30,
        });

        expect(listed?.threshold).toEqual({ metric: 'lines', percentage: 30 });
        expect(listed?.items.map(({ path }) => path.value)).toEqual([
          'src/unused.ts',
        ]);
      });

      it('should keep the files below it in the metric a person names', async () => {
        expect(await pathsOf({ below: 60, metric: 'branches' })).toEqual([
          'src/used.ts',
        ]);
      });

      it('should never keep a file with no numbers', async () => {
        expect(await pathsOf({ below: 100, state: 'unmeasured' })).toEqual([]);
      });

      it('should refuse a percentage above 100', async () => {
        await expect(
          handler.execute({ snapshotId: SNAPSHOT_ID, below: 101 }),
        ).rejects.toThrow(InvalidCoveragePercentageError);
      });
    });

    describe('with a metric alone', () => {
      it('should judge and order every file by it and narrow nothing', async () => {
        const listed = await handler.execute({
          snapshotId: SNAPSHOT_ID,
          metric: 'branches',
        });

        expect(listed?.threshold).toEqual({
          metric: 'branches',
          percentage: 80,
        });
        expect(listed?.items).toMatchObject([
          { path: { value: 'src/used.ts' }, belowThreshold: true },
          { path: { value: 'src/broken.ts' } },
          { path: { value: 'src/types.ts' } },
          { path: { value: 'src/unused.ts' }, belowThreshold: false },
        ]);
      });
    });

    it.each([
      ['measured', ['src/unused.ts', 'src/used.ts']],
      ['no_executable_code', ['src/types.ts']],
      ['unmeasured', ['src/broken.ts']],
    ] as const)(
      'should keep the files in the state %s',
      async (state, paths) => {
        expect(await pathsOf({ state })).toEqual(paths);
      },
    );

    describe('with the work on the files', () => {
      it('should give a measured file the newest improvement of its path', async () => {
        improvements.latest = [usedFileImproved()];

        const listed = await handler.execute({ snapshotId: SNAPSHOT_ID });

        expect(listed?.items[1]).toMatchObject({
          path: { value: 'src/used.ts' },
          latestImprovement: { id: USED_IMPROVEMENT_ID, status: 'completed' },
        });
        expect(listed?.items[0]).toMatchObject({ latestImprovement: null });
      });

      it('should give a file of another state no work, even when its path has some', async () => {
        improvements.latest = [
          { ...usedFileImproved(), path: FilePath.create('src/broken.ts') },
          { ...usedFileImproved(), path: FilePath.create('src/types.ts') },
        ];

        const listed = await handler.execute({ snapshotId: SNAPSHOT_ID });

        expect(listed?.items.slice(2)).toEqual([
          {
            path: FilePath.create('src/broken.ts'),
            state: 'unmeasured',
            reason: 'parse_failed',
            toolMessage: "')' expected.",
          },
          {
            path: FilePath.create('src/types.ts'),
            state: 'no_executable_code',
          },
        ]);
      });

      it('should ask for the improvements of the repository of the snapshot once', async () => {
        await handler.execute({ snapshotId: SNAPSHOT_ID });

        expect(improvements.asked).toEqual([
          RepositoryId.create(REPOSITORY_ID),
        ]);
      });
    });

    describe.each([
      ['no snapshot has the id', '00000000-0000-4000-8000-0000000000cc'],
      ['the id is no id of a snapshot', 'latest'],
    ])('when %s', (_case, snapshotId) => {
      it('should answer null and ask for no improvement', async () => {
        expect(await handler.execute({ snapshotId })).toBeNull();
        expect(improvements.asked).toEqual([]);
      });
    });
  });
});
