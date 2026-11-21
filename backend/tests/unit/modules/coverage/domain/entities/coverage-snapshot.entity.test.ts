import { describe, expect, it } from 'vitest';

import { InvalidCoverageSnapshotError } from '#coverage/domain/errors/invalid-coverage-snapshot.error';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import { FilePath } from '#kernel/primitives/file-path';
import {
  CAPTURED_AT,
  countersOf,
  fixtureFiles,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
  snapshotOf,
} from '#tests/support/coverage-snapshots';

const { used, unused, types, broken } = fixtureFiles();

const snapshot = snapshotOf({
  files: [used, unused, types],
  unmeasured: [broken],
});

describe('CoverageSnapshot', () => {
  describe('create', () => {
    it('should keep where and how it was measured', () => {
      expect(snapshot.id.equals(SnapshotId.create(SNAPSHOT_ID))).toBe(true);
      expect(snapshot.repositoryId.value).toBe(REPOSITORY_ID);
      expect(snapshot.commit.value).toBe(SNAPSHOT_COMMIT);
      expect(snapshot.originKey).toBe('scan:origin');
      expect(snapshot.project.testRunner).toBe('jest');
      expect(snapshot.parameters.coverageProvider).toBe('babel');
      expect(snapshot.testRunOutput).toBeNull();
      expect(snapshot.capturedAt.toString()).toBe(CAPTURED_AT);
    });

    it('should sort the files of each state by path', () => {
      expect(snapshot.files.map((file) => file.path.value)).toEqual([
        'src/types.ts',
        'src/unused.ts',
        'src/used.ts',
      ]);
      expect(snapshot.unmeasured).toEqual([broken]);
    });

    describe('when a file is in two states', () => {
      it('should throw InvalidCoverageSnapshotError', () => {
        const twice = UnmeasuredFile.create({
          path: FilePath.create('src/used.ts'),
          reason: 'no_counters',
          toolMessage: null,
        });

        expect(() =>
          snapshotOf({ files: [used], unmeasured: [twice] }),
        ).toThrow(
          new InvalidCoverageSnapshotError(
            'src/used.ts is in a snapshot twice, and a file has one state.',
          ),
        );
      });
    });

    describe('when the origin key is empty', () => {
      it('should throw InvalidCoverageSnapshotError', () => {
        expect(() => snapshotOf({ originKey: ' ' })).toThrow(
          new InvalidCoverageSnapshotError('A snapshot has an origin key.'),
        );
      });
    });
  });

  describe('totals', () => {
    it('should add the measured files only', () => {
      expect(
        snapshot.totals.equals(
          countersOf({
            statements: [2, 7],
            branches: [1, 2],
            functions: [1, 3],
            lines: [2, 6],
          }),
        ),
      ).toBe(true);
    });

    it('should be zero of zero when nothing was measured', () => {
      expect(
        snapshotOf({ files: [types], unmeasured: [broken] }).totals.equals(
          CoverageCounters.none(),
        ),
      ).toBe(true);
    });
  });

  describe('fileAt', () => {
    it('should find a file in any state', () => {
      expect(snapshot.fileAt(FilePath.create('src/used.ts'))).toBe(used);
      expect(snapshot.fileAt(FilePath.create('src/broken.ts'))).toBe(broken);
    });

    it('should answer a file that is not in the snapshot with null', () => {
      expect(snapshot.fileAt(FilePath.create('src/other.ts'))).toBeNull();
    });
  });

  describe('targets', () => {
    it('should give the measured files below the threshold', () => {
      expect(snapshot.targets(CoverageThreshold.byDefault())).toEqual([
        unused,
        used,
      ]);
    });

    it('should never give a file without numbers or without code', () => {
      const everything = CoverageThreshold.create({
        metric: 'lines',
        percentage: 100,
      });

      expect(
        snapshot.targets(everything).map((file) => file.path.value),
      ).not.toContain('src/types.ts');
      expect(
        snapshot.targets(everything).map((file) => file.path.value),
      ).not.toContain('src/broken.ts');
    });
  });

  describe('InvalidCoverageSnapshotError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidCoverageSnapshotError('x')).toMatchObject({
        code: 'invalid_coverage_snapshot',
        retryable: false,
      });
    });
  });
});
