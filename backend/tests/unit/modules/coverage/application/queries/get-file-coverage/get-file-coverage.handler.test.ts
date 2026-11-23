import { beforeEach, describe, expect, it } from 'vitest';

import { GetFileCoverageHandler } from '#coverage/application/queries/get-file-coverage/get-file-coverage.handler';
import { RepositoryThresholds } from '#coverage/application/repository-thresholds';
import { FilePath } from '#kernel/primitives/file-path';
import {
  fixtureSnapshot,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import { inMemorySnapshots } from '#tests/support/coverage-stand-ins';
import {
  judgeBy,
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

let repositories: StandInRepositories;
let handler: GetFileCoverageHandler;

beforeEach(() => {
  repositories = standInRepositories();
  handler = new GetFileCoverageHandler(
    inMemorySnapshots(fixtureSnapshot()),
    new RepositoryThresholds(repositories),
  );
});

function requestFor(path: string): {
  snapshotId: string;
  path: FilePath;
} {
  return { snapshotId: SNAPSHOT_ID, path: FilePath.create(path) };
}

describe('GetFileCoverageHandler', () => {
  describe('execute', () => {
    it('should give a measured file with what it leaves uncovered', async () => {
      const file = await handler.execute(requestFor('src/used.ts'));

      expect(file).toEqual({
        path: FilePath.create('src/used.ts'),
        state: 'measured',
        counters: {
          statements: { covered: 2, total: 6, percentage: 100 / 3 },
          branches: { covered: 1, total: 2, percentage: 50 },
          functions: { covered: 1, total: 2, percentage: 50 },
          lines: { covered: 2, total: 5, percentage: 40 },
        },
        belowThreshold: true,
        uncoveredLines: [{ start: 6, end: 9 }],
        openBranchLines: [6],
        uncoveredFunctions: [{ name: 'halve', line: 5 }],
      });
    });

    describe('when the repository has a threshold of its own', () => {
      it('should judge the file by it', async () => {
        judgeBy(repositories, 40);

        const file = await handler.execute(requestFor('src/used.ts'));

        expect(file).toMatchObject({ belowThreshold: false });
      });

      it('should judge the file anew once the threshold changed', async () => {
        judgeBy(repositories, 40);
        await handler.execute(requestFor('src/used.ts'));
        judgeBy(repositories, 41);

        const file = await handler.execute(requestFor('src/used.ts'));

        expect(file).toMatchObject({ belowThreshold: true });
      });
    });

    it('should give a file with no code by its state alone', async () => {
      const file = await handler.execute(requestFor('src/types.ts'));

      expect(file).toEqual({
        path: FilePath.create('src/types.ts'),
        state: 'no_executable_code',
      });
    });

    it('should give an unmeasured file with its reason', async () => {
      const file = await handler.execute(requestFor('src/broken.ts'));

      expect(file).toEqual({
        path: FilePath.create('src/broken.ts'),
        state: 'unmeasured',
        reason: 'parse_failed',
        toolMessage: "')' expected.",
      });
    });

    describe('when the snapshot has no such file', () => {
      it('should answer null', async () => {
        const file = await handler.execute(requestFor('src/other.ts'));

        expect(file).toBeNull();
      });
    });

    describe('when no snapshot has the id', () => {
      it('should answer null', async () => {
        const file = await handler.execute({
          snapshotId: '00000000-0000-4000-8000-0000000000cc',
          path: FilePath.create('src/used.ts'),
        });

        expect(file).toBeNull();
      });
    });
  });
});
