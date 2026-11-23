import { describe, expect, it } from 'vitest';

import { InvalidSnapshotIdError } from '#coverage/domain/errors/invalid-snapshot-id.error';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { SNAPSHOT_ID } from '#tests/support/coverage-snapshots';

describe('SnapshotId', () => {
  describe('create', () => {
    it('should keep a UUID in lower case', () => {
      expect(SnapshotId.create(SNAPSHOT_ID).value).toBe(SNAPSHOT_ID);
    });

    describe('when the text is not a UUID in lower case', () => {
      it.each(['', SNAPSHOT_ID.toUpperCase(), 'snapshot-1'])(
        'should throw InvalidSnapshotIdError for "%s"',
        (text) => {
          expect(() => SnapshotId.create(text)).toThrow(
            new InvalidSnapshotIdError(
              `"${text}" is not the id of a snapshot: a UUID in lower case.`,
            ),
          );
        },
      );
    });
  });

  describe('InvalidSnapshotIdError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidSnapshotIdError('x')).toMatchObject({
        code: 'invalid_snapshot_id',
        retryable: false,
      });
    });
  });
});
