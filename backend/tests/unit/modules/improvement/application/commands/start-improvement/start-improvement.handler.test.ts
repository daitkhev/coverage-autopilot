import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { improvementIn } from '#tests/support/improvement-journeys';
import { startCommandOf } from '#tests/support/improvement-request-stand-ins';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import {
  BASE_COMMIT,
  hashOf,
  IMPROVEMENT_ID,
  REPOSITORY_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
  TEST_SETTINGS,
} from '#tests/support/improvement-values';

const NEVER = new AbortController().signal;
const FIRST_ID = '00000000-0000-4000-8000-000000000001';

const POLICY = {
  requiredChecks: ['test_files_only', 'new_tests_pass'],
  repeatedRuns: 2,
  mutationThreshold: 50,
} as const;

let world: ImprovementRequestWorld;

beforeEach(() => {
  world = new ImprovementRequestWorld();
});

/** Nothing was stored, queued or even looked at in a transaction. */
function expectNothingRegistered(): void {
  expect(world.transactions.runs).toBe(0);
  expect(world.improvements.writes).toEqual([]);
  expect(world.queue.enqueued).toEqual([]);
}

describe('StartImprovementHandler', () => {
  describe('execute', () => {
    it('should create the improvement and queue its run in one transaction', async () => {
      const result = await world.start.execute(startCommandOf(), NEVER);

      expect(result).toEqual({
        outcome: 'created',
        improvement: expect.objectContaining({
          id: FIRST_ID,
          status: 'created',
          sourceSnapshotId: SOURCE_SNAPSHOT_ID,
          createdAt: world.clock.now(),
          waitingFor: 'worker',
          progress: null,
        }) as unknown,
      });
      const [write] = world.improvements.writes;
      expect(write?.improvement.request.key.value).toBe('request-1');
      expect(write?.transaction).toBe(world.transactions.transaction);
      expect(world.queue.enqueued).toEqual([
        {
          request: expect.objectContaining({
            idempotencyKey: `improvement:${FIRST_ID}:run`,
          }) as unknown,
          transaction: world.transactions.transaction,
        },
      ]);
      expect(world.transactions.runs).toBe(1);
    });

    it('should check the file of the snapshot against the head of the default branch', async () => {
      await world.start.execute(startCommandOf(), NEVER);

      const snapshot = world.coverage.snapshot;
      expect(world.coverage.asked).toEqual([
        { snapshotId: SOURCE_SNAPSHOT_ID },
        { snapshotId: SOURCE_SNAPSHOT_ID, path: FilePath.create(TARGET_FILE) },
      ]);
      expect(world.repositories.assessed).toEqual([
        {
          repositoryId: snapshot?.repositoryId,
          snapshotCommit: snapshot?.commit,
          targetFile: FilePath.create(TARGET_FILE),
        },
      ]);
    });

    it('should make the improvement on the repository and the commit of the snapshot', async () => {
      const result = await world.start.execute(startCommandOf(), NEVER);

      expect(result.outcome === 'created' && result.improvement).toEqual(
        expect.objectContaining({
          repositoryId: RepositoryId.create(REPOSITORY_ID),
          baseCommit: CommitSha.create(BASE_COMMIT),
          targetFile: FilePath.create(TARGET_FILE),
        }),
      );
    });

    it('should fill the request from the settings and keep its own choices', async () => {
      const result = await world.start.execute(
        startCommandOf({ mode: 'review', budget: { attempts: 5 } }),
        NEVER,
      );

      expect(result.outcome === 'created' && result.improvement).toEqual(
        expect.objectContaining({
          mode: 'review',
          budget: { attempts: 5, tokens: null, minutes: 30 },
          generator: expect.objectContaining({
            promptVersion: 'v1',
          }) as unknown,
        }),
      );
    });

    it('should give the request the fingerprint of the canonical text of its work', async () => {
      world.hasher.fingerprint = hashOf('9');

      await world.start.execute(startCommandOf(), NEVER);

      expect(world.hasher.texts).toHaveLength(1);
      expect(world.hasher.texts[0]).toContain(
        `"baseCommit":"${BASE_COMMIT}","targetFile":"${TARGET_FILE}"`,
      );
      expect(
        world.improvements.writes[0]?.improvement.request.fingerprint.value,
      ).toBe(hashOf('9'));
    });

    describe('when the snapshot is not there', () => {
      it('should refuse with snapshot_not_found and ask the host nothing', async () => {
        world.coverage.snapshot = null;

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result).toEqual({
          outcome: 'refused',
          reason: 'snapshot_not_found',
          message: `No snapshot has the id ${SOURCE_SNAPSHOT_ID}.`,
        });
        expect(world.repositories.assessed).toEqual([]);
        expectNothingRegistered();
      });
    });

    describe('when the snapshot has no measured file at the path', () => {
      it.each([
        ['does not list it', null],
        [
          'could not measure it',
          {
            path: FilePath.create(TARGET_FILE),
            state: 'unmeasured',
            reason: 'parse_failed',
            toolMessage: null,
          } as const,
        ],
        [
          'found no code in it',
          {
            path: FilePath.create(TARGET_FILE),
            state: 'no_executable_code',
          } as const,
        ],
      ])(
        'should refuse with target_not_measured when it %s',
        async (_case, file) => {
          world.coverage.file = file;

          const result = await world.start.execute(startCommandOf(), NEVER);

          expect(result).toEqual({
            outcome: 'refused',
            reason: 'target_not_measured',
            message: `${TARGET_FILE} is not a measured file of the snapshot ${SOURCE_SNAPSHOT_ID}.`,
          });
          expect(world.repositories.assessed).toEqual([]);
          expectNothingRegistered();
        },
      );
    });

    describe('when the file is already above the threshold', () => {
      it('should create the improvement and leave the decision to its run', async () => {
        const file = world.coverage.file;
        world.coverage.file =
          file?.state === 'measured'
            ? { ...file, belowThreshold: false }
            : null;

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result.outcome).toBe('created');
      });
    });

    describe('when the head moved and the file stayed the same', () => {
      it('should create the improvement', async () => {
        world.repositories.assessment = 'unchanged';

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result.outcome).toBe('created');
      });
    });

    describe('when the file changed on the default branch', () => {
      it('should refuse with stale_snapshot and create nothing', async () => {
        world.repositories.assessment = 'stale';

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result).toEqual({
          outcome: 'refused',
          reason: 'stale_snapshot',
          message: `${TARGET_FILE} changed on the default branch after the commit ${BASE_COMMIT} of the snapshot.`,
        });
        expectNothingRegistered();
      });
    });

    describe('when the commit of the snapshot left the history of the default branch', () => {
      it('should refuse with stale_snapshot and create nothing', async () => {
        world.repositories.assessment = 'diverged';

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result).toEqual({
          outcome: 'refused',
          reason: 'stale_snapshot',
          message: `The commit ${BASE_COMMIT} of the snapshot is not in the history of the default branch any more.`,
        });
        expectNothingRegistered();
      });
    });

    describe('when the signal is aborted while the head is read', () => {
      it('should let the error pass and create nothing', async () => {
        const stop = new AbortController();
        stop.abort(new Error('user_cancelled'));

        await expect(
          world.start.execute(startCommandOf(), stop.signal),
        ).rejects.toThrow('user_cancelled');
        expectNothingRegistered();
      });
    });

    describe('when a value of the request breaks a rule', () => {
      it.each([
        [
          'a snapshot id',
          { snapshotId: 'snapshot-1' },
          '"snapshot-1" is not the id of a snapshot: a UUID in lower case.',
        ],
        [
          'a budget',
          { budget: { attempts: 11 } },
          'The budget asks for 11 of attempts, and the service allows 10.',
        ],
        [
          'a limit of tokens under a subscription',
          { budget: { tokens: 5000 } },
          'The budget asks for 5000 of tokens, and the service allows no limit.',
        ],
        [
          'a path',
          { filePath: 'src//price.ts' },
          '"src//price.ts" is not a path as git stores it: it has an ' +
            'empty, a "." or a ".." part.',
        ],
        [
          'a quality policy',
          { qualityPolicy: { ...POLICY, requiredChecks: ['type_check'] } },
          'The quality policy does not require test_files_only, without ' +
            'which the gate applies no patch.',
        ],
      ] as const)(
        'should refuse with invalid_request for %s before it asks anything',
        async (_value, spec, message) => {
          const result = await world.start.execute(startCommandOf(spec), NEVER);

          expect(result).toEqual({
            outcome: 'refused',
            reason: 'invalid_request',
            message,
          });
          expect(world.coverage.asked).toEqual([]);
          expectNothingRegistered();
        },
      );
    });

    describe('when the generator has no credential', () => {
      it('should refuse before it asks or stores anything', async () => {
        const missingCredential = 'CLAUDE_CODE_OAUTH_TOKEN';
        world = new ImprovementRequestWorld({
          ...TEST_SETTINGS,
          missingCredential,
        });

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result).toMatchObject({ reason: 'generator_unavailable' });
        expect(world.coverage.asked).toEqual([]);
        expectNothingRegistered();
      });
    });

    describe('when the same key asked for the same work before', () => {
      it('should give that improvement as a person sees it', async () => {
        await world.stored(improvementIn('awaiting_approval'));

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result).toEqual({
          outcome: 'existing',
          improvement: expect.objectContaining({
            id: IMPROVEMENT_ID,
            status: 'awaiting_approval',
            waitingFor: 'approval',
          }) as unknown,
        });
      });
    });

    describe('when earlier work stands in the way', () => {
      it('should give the refusal that names it', async () => {
        await world.stored(improvementIn('generating'));
        world.hasher.fingerprint = hashOf('e');

        const result = await world.start.execute(startCommandOf(), NEVER);

        expect(result).toEqual(
          expect.objectContaining({
            outcome: 'refused',
            reason: 'request_key_reused',
            improvementId: IMPROVEMENT_ID,
          }),
        );
      });
    });
  });
});
