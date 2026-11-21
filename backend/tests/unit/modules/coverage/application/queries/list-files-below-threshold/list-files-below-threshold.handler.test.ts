import { describe, expect, it } from 'vitest';

import { ListFilesBelowThresholdHandler } from '#coverage/application/queries/list-files-below-threshold/list-files-below-threshold.handler';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import {
  fixtureSnapshot,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import { inMemorySnapshots } from '#tests/support/coverage-stand-ins';
import { COVERAGE_TEST_SETTINGS } from '#tests/support/recording-sandbox';

const handler = new ListFilesBelowThresholdHandler(
  inMemorySnapshots(fixtureSnapshot()),
  COVERAGE_TEST_SETTINGS,
);

describe('ListFilesBelowThresholdHandler', () => {
  describe('execute', () => {
    it('should list the measured files below, least covered first', async () => {
      const below = await handler.execute({ snapshotId: SNAPSHOT_ID });

      expect(below).toMatchObject({
        snapshotId: SNAPSHOT_ID,
        threshold: { metric: 'lines', percentage: 80 },
        files: [
          {
            path: { value: 'src/unused.ts' },
            counters: {
              branches: { covered: 0, total: 0, percentage: null },
              lines: { covered: 0, total: 1, percentage: 0 },
            },
            belowThreshold: true,
          },
          { path: { value: 'src/used.ts' }, belowThreshold: true },
        ],
      });
    });

    describe('with a threshold of its own', () => {
      it('should list the files below that threshold', async () => {
        const threshold = CoverageThreshold.create({
          metric: 'lines',
          percentage: 30,
        });

        const below = await handler.execute({
          snapshotId: SNAPSHOT_ID,
          threshold,
        });

        expect(below?.threshold).toEqual({ metric: 'lines', percentage: 30 });
        expect(below?.files.map(({ path }) => path.value)).toEqual([
          'src/unused.ts',
        ]);
      });
    });

    describe('when no snapshot has the id', () => {
      it('should answer null', async () => {
        const below = await handler.execute({
          snapshotId: '00000000-0000-4000-8000-0000000000cc',
        });

        expect(below).toBeNull();
      });
    });
  });
});
