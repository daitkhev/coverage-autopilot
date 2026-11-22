import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import { improvementIn } from '#tests/support/improvement-journeys';
import {
  NO_CODE_FILE,
  UNMEASURED_FILE,
} from '#tests/support/improvement-request-stand-ins';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import {
  hashOf,
  IMPROVEMENT_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';

const MISSING_ID = '00000000-0000-4000-8000-000000000999';

/** A second improvement of the target, asked for after the first. */
const NEWER = {
  id: '00000000-0000-4000-8000-000000000202',
  key: 'request-2',
  fingerprint: hashOf('2'),
};

let world: ImprovementRequestWorld;

beforeEach(() => {
  world = new ImprovementRequestWorld();
});

/** The work the listed file at the path has, or `undefined` for none. */
async function workOn(path: string): Promise<unknown> {
  const listed = await world.listSnapshotFiles.execute({
    snapshotId: SOURCE_SNAPSHOT_ID,
  });
  const file = listed?.items.find((each) => each.path.value === path);
  return file?.state === 'measured' ? file.latestImprovement : undefined;
}

describe('ListSnapshotFilesHandler', () => {
  describe('execute', () => {
    it('should give every file of the snapshot, a measured one with its work', async () => {
      await world.stored(improvementIn('completed'));

      const listed = await world.listSnapshotFiles.execute({
        snapshotId: SOURCE_SNAPSHOT_ID,
      });

      const target = world.coverage.file;
      expect(listed).toEqual({
        snapshotId: SOURCE_SNAPSHOT_ID,
        threshold: { metric: 'lines', percentage: 80 },
        items: [
          {
            path: FilePath.create(TARGET_FILE),
            state: 'measured',
            coverage: target?.state === 'measured' ? target.counters : null,
            belowThreshold: true,
            uncoveredLines: [],
            openBranchLines: [],
            uncoveredFunctions: [],
            latestImprovement: { id: IMPROVEMENT_ID, status: 'completed' },
          },
          { path: FilePath.create(NO_CODE_FILE), state: 'no_executable_code' },
          {
            path: FilePath.create(UNMEASURED_FILE),
            state: 'unmeasured',
            reason: 'parse_failed',
            toolMessage: 'Unexpected token.',
          },
        ],
      });
    });

    it('should give the newest improvement of the file', async () => {
      await world.stored(
        improvementIn('failed'),
        improvementIn('generating', NEWER),
      );

      expect(await workOn(TARGET_FILE)).toEqual({
        id: NEWER.id,
        status: 'generating',
      });
    });

    it('should give no work for a file nobody asked to improve', async () => {
      expect(await workOn(TARGET_FILE)).toBeNull();
    });

    it('should not take the work on a file of the same path in another repository', async () => {
      await world.stored(
        improvementIn('completed', {
          repositoryId: '00000000-0000-4000-8000-000000000201',
        }),
      );

      expect(await workOn(TARGET_FILE)).toBeNull();
    });

    it('should read the improvements once for the whole list', async () => {
      const read = vi.spyOn(world.improvements, 'latestByTarget');

      await world.listSnapshotFiles.execute({ snapshotId: SOURCE_SNAPSHOT_ID });

      expect(read).toHaveBeenCalledTimes(1);
    });

    it('should ask coverage with the filters the query gives and no other', async () => {
      await world.listSnapshotFiles.execute({
        snapshotId: SOURCE_SNAPSHOT_ID,
        below: 50,
        metric: undefined,
        state: 'measured',
      });

      expect(world.coverage.asked).toEqual([
        { snapshotId: SOURCE_SNAPSHOT_ID },
        { snapshotId: SOURCE_SNAPSHOT_ID, below: 50, state: 'measured' },
      ]);
    });

    it('should pass the counter the threshold reads on to coverage', async () => {
      await world.listSnapshotFiles.execute({
        snapshotId: SOURCE_SNAPSHOT_ID,
        metric: 'branches',
      });

      expect(world.coverage.asked.at(-1)).toEqual({
        snapshotId: SOURCE_SNAPSHOT_ID,
        metric: 'branches',
      });
    });

    describe('when no snapshot has the id', () => {
      it('should answer null and list nothing', async () => {
        world.coverage.snapshot = null;

        expect(
          await world.listSnapshotFiles.execute({ snapshotId: MISSING_ID }),
        ).toBeNull();
        expect(world.coverage.asked).toEqual([{ snapshotId: MISSING_ID }]);
      });
    });

    describe('when coverage lists no files of the snapshot', () => {
      it('should answer null', async () => {
        world.coverage.files = null;

        expect(
          await world.listSnapshotFiles.execute({
            snapshotId: SOURCE_SNAPSHOT_ID,
          }),
        ).toBeNull();
      });
    });

    describe('when the id is not one of a snapshot', () => {
      it('should answer null and ask coverage nothing', async () => {
        expect(
          await world.listSnapshotFiles.execute({ snapshotId: 'latest' }),
        ).toBeNull();
        expect(world.coverage.asked).toEqual([]);
      });
    });
  });
});
