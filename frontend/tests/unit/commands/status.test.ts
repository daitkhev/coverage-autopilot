import { describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { status } from '#commands/status';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  type IoSettings,
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import { IMPROVEMENT_BY_STATUS as BY_STATUS } from '#tests/support/sample-improvements';

const STATUS = { name: 'status', id: 'improvement-webhook' } as const;

function statusIo(
  improvement: Improvement,
  settings: IoSettings = {},
): RecordingIo {
  return recordingIo(
    { getImprovement: () => Promise.resolve(answered(improvement)) },
    settings,
  );
}

describe('status', () => {
  it('should ask for the improvement with the id', async () => {
    const io = statusIo(BY_STATUS.failed);

    await expect(status(STATUS, io)).resolves.toBe(0);

    expect(io.session.api.calls).toEqual([
      { method: 'getImprovement', arguments: ['improvement-webhook'] },
    ]);
  });

  it('should print its status and reason, every attempt and its budget', async () => {
    const io = statusIo(BY_STATUS.failed);

    await status(STATUS, io);

    expect(io.printed).toMatchInlineSnapshot(`
      [
        "improvement  improvement-webhook",
        "file         src/api/webhook.ts",
        "status       ✕ FAIL  3 attempts were rejected. (budget_exhausted)",
        "mode         automatic",
        "attempt 1    rejected: The new tests detect 0 of 14 mutants.",
        "attempt 2    rejected: The new tests detect 0 of 14 mutants.",
        "attempt 3    rejected: The new tests detect 0 of 14 mutants.",
        "attempts     3 of 3",
        "tokens       120000",
        "time         28m 00s of 30 minutes",
      ]
    `);
  });

  it('should print the pull request of a completed one beside its status', async () => {
    const io = statusIo(BY_STATUS.completed);

    await status(STATUS, io);

    expect(io.printed[2]).toBe(
      'status       ✓ DONE  https://github.com/example/payments/pull/131',
    );
  });

  describe('when the budget limits the tokens', () => {
    it('should print the limit beside the tokens spent', async () => {
      const io = statusIo({
        ...BY_STATUS.generating,
        budget: { ...BY_STATUS.generating.budget, tokens: 200_000 },
      });

      await status(STATUS, io);

      expect(io.printed).toContain('tokens       41000 of 200000');
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the improvement of the contract as one document', async () => {
      const io = statusIo(BY_STATUS.failed, { json: true });

      await expect(status(STATUS, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(BY_STATUS.failed)]);
    });
  });

  describe('when the service knows no improvement with the id', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const io = recordingIo({
        getImprovement: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(status(STATUS, io)).resolves.toBe(1);

      expectRefusal(io, NOT_FOUND);
    });
  });
});
