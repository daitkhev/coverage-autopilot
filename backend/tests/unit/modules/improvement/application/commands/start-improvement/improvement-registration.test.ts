import { beforeEach, describe, expect, it } from 'vitest';

import { improvementIn } from '#tests/support/improvement-journeys';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import {
  hashOf,
  IMPROVEMENT_ID,
  requestOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';

const FIRST_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_FILE = 'src/tax.ts';

/** The request of every test: key `request-1`, the fingerprint of `f`. */
const request = requestOf();

let world: ImprovementRequestWorld;

beforeEach(() => {
  world = new ImprovementRequestWorld();
});

describe('ImprovementRegistration', () => {
  describe('register', () => {
    it('should insert a new improvement and its run in one transaction', async () => {
      const registered = await world.registration.register(request);

      const [write] = world.improvements.writes;
      expect(world.improvements.writes).toHaveLength(1);
      expect(write?.transaction).toBe(world.transactions.transaction);
      expect(write?.improvement.id.value).toBe(FIRST_ID);
      expect(write?.improvement.createdAt).toEqual(world.clock.now());
      expect(write?.improvement.request).toEqual(request);
      expect(registered).toEqual({
        outcome: 'created',
        improvement: write?.improvement,
      });
      expect(world.queue.enqueued).toEqual([
        {
          request: {
            kind: 'improvement',
            repositoryId: request.repositoryId,
            idempotencyKey: `improvement:${FIRST_ID}:run`,
            subjectId: FIRST_ID,
            payload: { version: 1 },
          },
          transaction: world.transactions.transaction,
        },
      ]);
      expect(world.transactions.runs).toBe(1);
    });

    describe('when the same key asked for the same work before', () => {
      it.each(['created', 'generating', 'completed', 'failed'] as const)(
        'should give the earlier improvement that is %s and store nothing',
        async (status) => {
          await world.stored(improvementIn(status));

          const registered = await world.registration.register(request);

          expect(registered.outcome).toBe('existing');
          expect(
            registered.outcome === 'existing' &&
              registered.improvement.id.value,
          ).toBe(IMPROVEMENT_ID);
          expect(world.improvements.writes).toEqual([]);
          expect(world.queue.enqueued).toEqual([]);
        },
      );
    });

    describe('when the same key asked for other work before', () => {
      it('should refuse with request_key_reused and name that improvement', async () => {
        await world.stored(
          improvementIn('failed', { fingerprint: hashOf('e') }),
        );

        expect(await world.registration.register(request)).toEqual({
          outcome: 'refused',
          reason: 'request_key_reused',
          message: `The request key was used for other work, by the improvement ${IMPROVEMENT_ID}.`,
          improvementId: IMPROVEMENT_ID,
        });
        expect(world.improvements.writes).toEqual([]);
      });
    });

    describe('when another key asked for the same work', () => {
      it.each([
        'analyzing',
        'awaiting_approval',
        'completed',
        'skipped',
      ] as const)(
        'should refuse with work_already_requested while the earlier one is %s',
        async (status) => {
          await world.stored(improvementIn(status, { key: 'request-9' }));

          expect(await world.registration.register(request)).toEqual({
            outcome: 'refused',
            reason: 'work_already_requested',
            message: `The same work was asked for already: the improvement ${IMPROVEMENT_ID} is ${status}.`,
            improvementId: IMPROVEMENT_ID,
          });
          expect(world.queue.enqueued).toEqual([]);
        },
      );

      it.each(['failed', 'cancelled'] as const)(
        'should create a new improvement when the earlier one is %s',
        async (status) => {
          await world.stored(improvementIn(status, { key: 'request-9' }));

          const registered = await world.registration.register(request);

          expect(registered.outcome).toBe('created');
          expect(world.queue.enqueued).toHaveLength(1);
        },
      );
    });

    describe('when another request improves the same file', () => {
      it('should refuse with improvement_in_progress and name that improvement', async () => {
        await world.stored(
          improvementIn('waiting_for_limit', {
            key: 'request-9',
            fingerprint: hashOf('e'),
          }),
        );

        expect(await world.registration.register(request)).toEqual({
          outcome: 'refused',
          reason: 'improvement_in_progress',
          message: `${TARGET_FILE} is being improved already: the improvement ${IMPROVEMENT_ID} is waiting_for_limit.`,
          improvementId: IMPROVEMENT_ID,
        });
        expect(world.improvements.writes).toEqual([]);
      });

      it('should create the improvement once that request ended', async () => {
        await world.stored(
          improvementIn('completed', {
            key: 'request-9',
            fingerprint: hashOf('e'),
          }),
        );

        expect((await world.registration.register(request)).outcome).toBe(
          'created',
        );
      });
    });

    describe('when another file of the repository is being improved', () => {
      it('should create the improvement', async () => {
        await world.stored(
          improvementIn('analyzing', {
            key: 'request-9',
            fingerprint: hashOf('e'),
            targetFile: OTHER_FILE,
          }),
        );

        expect((await world.registration.register(request)).outcome).toBe(
          'created',
        );
      });
    });
  });
});
