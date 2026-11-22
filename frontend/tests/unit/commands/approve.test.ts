import { describe, expect, it } from 'vitest';

import { approve } from '#commands/approve';
import type { Command } from '#commands/command';
import { answered, refused } from '#tests/support/fake-service-api';
import { ACCEPTED_HASH } from '#tests/support/sample-attempts';
import { expectRefusal, recordingIo } from '#tests/support/sample-command-io';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';

const APPROVE: Command<'approve'> = {
  name: 'approve',
  id: 'improvement-sum',
  hash: ACCEPTED_HASH,
};
const ACCEPTED = 202;
const PUBLISHING = IMPROVEMENT_BY_STATUS.publishing;

describe('approve', () => {
  it('should approve the patch by its hash and print the improvement', async () => {
    const io = recordingIo({
      approveImprovement: () => Promise.resolve(answered(PUBLISHING, ACCEPTED)),
    });

    await expect(approve(APPROVE, io)).resolves.toBe(0);

    expect(io.session.api.calls).toEqual([
      {
        method: 'approveImprovement',
        arguments: ['improvement-sum', { patchHash: ACCEPTED_HASH }],
      },
    ]);
    expect(io.printed).toEqual([
      '⠋ RUN  improvement-rounding  src/billing/rounding.ts  1s  publishing',
    ]);
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the improvement of the contract as one document', async () => {
      const io = recordingIo(
        {
          approveImprovement: () =>
            Promise.resolve(answered(PUBLISHING, ACCEPTED)),
        },
        { json: true },
      );

      await expect(approve(APPROVE, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(PUBLISHING)]);
    });
  });

  describe('when the stored patch has another hash', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const mismatch = {
        error: 'patch_hash_mismatch',
        message: 'The stored patch has another hash.',
      } as const;
      const io = recordingIo({
        approveImprovement: () => Promise.resolve(refused(409, mismatch)),
      });

      await expect(approve(APPROVE, io)).resolves.toBe(1);

      expectRefusal(io, mismatch);
    });
  });
});
