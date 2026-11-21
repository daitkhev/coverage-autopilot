import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import { SOURCE_SNAPSHOT_ID } from '#tests/support/improvement-values';

describe('SnapshotId', () => {
  describe('create', () => {
    it('should keep the id the coverage module gave', () => {
      expect(SnapshotId.create(SOURCE_SNAPSHOT_ID).value).toBe(
        SOURCE_SNAPSHOT_ID,
      );
    });

    describe('when the text is not a UUID in lower case', () => {
      it('should throw InvalidImprovementValueError', () => {
        expect(() => SnapshotId.create('snapshot')).toThrow(
          new InvalidImprovementValueError(
            '"snapshot" is not the id of a snapshot: a UUID in lower case.',
          ),
        );
      });
    });
  });
});
