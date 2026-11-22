import { describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { ServiceAnswer } from '#api/service-api';
import type { Command } from '#commands/command';
import { improve } from '#commands/improve';
import { answered, refused } from '#tests/support/fake-service-api';
import { ACCEPTED_HASH, OPEN_ATTEMPT } from '#tests/support/sample-attempts';
import {
  expectRefusal,
  inTurn,
  type IoSettings,
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  IMPROVEMENT_BY_STATUS as BY_STATUS,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';

const IMPROVE: Command<'improve'> = {
  name: 'improve',
  repository: 'example/payments',
  wait: false,
  request: {
    filePath: 'src/api/refund.ts',
    mode: 'automatic',
    budget: { attempts: 3 },
  },
};
const WAIT: Command<'improve'> = { ...IMPROVE, wait: true };
const ACCEPTED = 202;

const CREATED = BY_STATUS.created;
const FIRST_ATTEMPT = { ...OPEN_ATTEMPT, number: 1 };

/** The first attempt, before the one of the samples was rejected. */
const WRITING_FIRST: Improvement = {
  ...BY_STATUS.generating,
  usage: { ...BY_STATUS.generating.usage, attempts: 1 },
  attempts: [FIRST_ATTEMPT],
};
const CHECKING_FIRST: Improvement = {
  ...BY_STATUS.verifying,
  usage: { ...BY_STATUS.verifying.usage, attempts: 1 },
  attempts: [{ ...FIRST_ATTEMPT, patchHash: ACCEPTED_HASH }],
};
const PUBLISHING: Improvement = {
  ...BY_STATUS.publishing,
  attempts: BY_STATUS.completed.attempts,
};

const WAITING_LINE = 'waiting      for its repository';
const REJECTED_LINE =
  'attempt 1    rejected: The new tests detect 0 of 14 mutants.';

function improveIo(
  answers: readonly ServiceAnswer<Improvement>[],
  settings: IoSettings = {},
): RecordingIo {
  const [first = answered(CREATED), ...rest] = answers;
  return recordingIo(
    {
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
      startImprovement: () => Promise.resolve(answered(CREATED, ACCEPTED)),
      getImprovement: inTurn(first, ...rest),
      getImprovementPatch: () =>
        Promise.resolve(answered(PATCH_AWAITING_APPROVAL)),
    },
    settings,
  );
}

describe('improve', () => {
  it('should request the file of the latest snapshot with a new key', async () => {
    const io = improveIo([]);

    await expect(improve(IMPROVE, io)).resolves.toBe(0);

    expect(io.session.api.calls.at(-1)).toEqual({
      method: 'startImprovement',
      arguments: [
        {
          filePath: 'src/api/refund.ts',
          mode: 'automatic',
          budget: { attempts: 3 },
          snapshotId: 'snapshot-payments-2',
        },
        expect.any(String),
      ],
    });
    expect(io.printed).toEqual([
      '○ WAIT  improvement-refund  src/api/refund.ts  30s  waits for its repository',
    ]);
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the improvement of the contract as one document', async () => {
      const io = improveIo([], { json: true });

      await expect(improve(IMPROVE, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(CREATED)]);
    });
  });

  describe('when the service refuses the request', () => {
    it.each([IMPROVE, WAIT])(
      'should say the refusal and end with 1, waiting or not',
      async (command) => {
        const unavailable = {
          error: 'generator_unavailable',
          message: 'The generator has no credential.',
        } as const;
        const io = recordingIo({
          listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
          startImprovement: () => Promise.resolve(refused(409, unavailable)),
        });

        await expect(improve(command, io)).resolves.toBe(1);

        expectRefusal(io, unavailable);
      },
    );
  });

  describe('when the repository was never scanned', () => {
    it('should request nothing and end with 1', async () => {
      const io = improveIo([]);

      await expect(
        improve({ ...IMPROVE, repository: 'example/notifier' }, io),
      ).resolves.toBe(1);

      expect(io.session.api.calls).toHaveLength(1);
    });
  });

  describe('when it waits, an attempt is rejected and the next accepted', () => {
    const ANSWERS = [
      BY_STATUS.analyzing,
      WRITING_FIRST,
      CHECKING_FIRST,
      BY_STATUS.generating,
      BY_STATUS.verifying,
      PUBLISHING,
      BY_STATUS.completed,
    ].map((value) => answered(value));

    it('should say each change once, as the document shows', async () => {
      const io = improveIo(ANSWERS);

      await expect(improve(WAIT, io)).resolves.toBe(0);

      expect(io.said).toEqual([
        WAITING_LINE,
        'analyzing',
        'attempt 1    writing a test',
        'attempt 1    checking the patch',
        REJECTED_LINE,
        'attempt 2    writing a test',
        'attempt 2    checking the patch',
        'attempt 2    accepted: lines 88.2%, 11 of 14 mutants detected',
        'publishing',
      ]);
      expect(io.pauses).toHaveLength(ANSWERS.length);
    });

    it('should print only the address of the pull request', async () => {
      const io = improveIo(ANSWERS);

      await improve(WAIT, io);

      expect(io.printed).toEqual([
        'https://github.com/example/payments/pull/131',
      ]);
    });

    it('should print the improvement of the contract with --json', async () => {
      const io = improveIo(ANSWERS, { json: true });

      await improve(WAIT, io);

      expect(io.printed).toEqual([JSON.stringify(BY_STATUS.completed)]);
    });

    it('should print nothing when no pull request was named', async () => {
      const io = improveIo([
        answered({ ...BY_STATUS.completed, pullRequest: null }),
      ]);

      await expect(improve(WAIT, io)).resolves.toBe(0);

      expect(io.printed).toEqual([]);
    });
  });

  describe('when it waits and the improvement fails', () => {
    it('should say the failure in the shape of a refusal and end with 1', async () => {
      const io = improveIo([answered(BY_STATUS.failed)]);

      await expect(improve(WAIT, io)).resolves.toBe(1);

      expect(io.said).toEqual([
        WAITING_LINE,
        REJECTED_LINE,
        'attempt 2    rejected: The new tests detect 0 of 14 mutants.',
        'attempt 3    rejected: The new tests detect 0 of 14 mutants.',
        '{"error":"budget_exhausted","message":"3 attempts were rejected."}',
      ]);
      expect(io.printed).toEqual([]);
    });
  });

  describe('when it waits and the patch waits for approval', () => {
    it('should end with the command that approves the patch by its hash', async () => {
      const io = improveIo([answered(BY_STATUS.awaiting_approval)]);

      await expect(improve(WAIT, io)).resolves.toBe(0);

      expect(io.said).toEqual([
        WAITING_LINE,
        'attempt 1    accepted: lines 88.2%, 11 of 14 mutants detected',
      ]);
      expect(io.printed).toEqual([
        `coverage-autopilot approve improvement-sum --hash ${ACCEPTED_HASH}`,
      ]);
    });

    it('should end with 1 when the patch is refused', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        startImprovement: () =>
          Promise.resolve(answered(BY_STATUS.awaiting_approval)),
        getImprovementPatch: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(improve(WAIT, io)).resolves.toBe(1);

      expect(io.said.at(-1)).toBe(JSON.stringify(NOT_FOUND));
    });
  });

  describe('when it waits and the improvement is skipped', () => {
    it('should say why, print no result and end with 0', async () => {
      const io = improveIo([answered(BY_STATUS.skipped)]);

      await expect(improve(WAIT, io)).resolves.toBe(0);

      expect(io.said).toEqual([
        WAITING_LINE,
        'skipped      The fresh measurement is already above the threshold. (threshold_met)',
      ]);
      expect(io.printed).toEqual([]);
    });
  });

  describe('when it waits and the improvement is cancelled', () => {
    it('should say the attempt that ended and the cancel, and end with 1', async () => {
      const io = improveIo([answered(BY_STATUS.cancelled)]);

      await expect(improve(WAIT, io)).resolves.toBe(1);

      expect(io.said).toEqual([
        WAITING_LINE,
        'attempt 1    no verdict: stopped before a test was written',
        'cancelled',
      ]);
    });
  });

  describe('when it waits for the limit of the subscription', () => {
    it('should say until when, in the time zone of the user', async () => {
      const io = improveIo([
        answered(BY_STATUS.waiting_for_limit),
        answered(BY_STATUS.completed),
      ]);

      await improve(WAIT, io);

      expect(io.said.slice(1, 3)).toEqual([
        REJECTED_LINE,
        'waiting      for the limit until 16:00',
      ]);
    });
  });
});
