import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { StaleImprovementError } from '#improvement/domain/errors/stale-improvement.error';
import { IMPROVEMENT_STATUSES } from '#improvement/domain/value-objects/improvement-status.vo';
import {
  createdImprovement,
  improvementIn,
  STEP_MINUTE,
} from '#tests/support/improvement-journeys';
import {
  anotherOf,
  IMPROVEMENT_STORES,
  type ImprovementStore,
  OTHER_FILE,
} from '#tests/support/improvement-stores';
import {
  budgetOf,
  generatedOf,
  IMPROVEMENT_ID,
  improvementIdOf,
  minutesIn,
  reportOf,
} from '#tests/support/improvement-values';

/** The start of what a unique index of SQLite and the memory say. */
const UNIQUE = 'UNIQUE constraint failed: improvements';

const AT = minutesIn(STEP_MINUTE.judged);

const { id, key } = anotherOf(2);

/** A request of the same work as the first, for another file. */
const SAME_WORK = { id, key, targetFile: OTHER_FILE };

describe.each(IMPROVEMENT_STORES)('%s', (_name, open) => {
  let store: ImprovementStore;

  beforeEach(() => {
    store = open();
  });

  afterEach(() => {
    store.remove();
  });

  async function stored(): Promise<Improvement> {
    const found = await store.repository.findById(improvementIdOf());
    if (found === null) {
      throw new Error(`The improvement ${IMPROVEMENT_ID} is not stored.`);
    }
    return found;
  }

  describe('insert', () => {
    it.each(IMPROVEMENT_STATUSES)(
      'should give back a %s improvement as it was written',
      async (status) => {
        const improvement = improvementIn(status);

        await store.insert(improvement);

        expect((await stored()).state).toEqual(improvement.state);
      },
    );

    it('should give back a request in review mode with a limit of tokens', async () => {
      const improvement = improvementIn('awaiting_approval', {
        billing: 'api_key',
        budget: budgetOf({ tokens: 90_000 }),
      });

      await store.insert(improvement);

      expect((await stored()).request).toEqual(improvement.request);
    });

    describe('when the id or the request key is taken', () => {
      it.each([
        { ...anotherOf(2), id: IMPROVEMENT_ID },
        { ...anotherOf(2), key: 'request-1' },
      ])('should refuse the second improvement', async (spec) => {
        await store.insert(improvementIn('completed'));

        await expect(
          store.insert(createdImprovement({ ...spec, targetFile: OTHER_FILE })),
        ).rejects.toThrow(UNIQUE);
      });
    });

    describe('when the same work is asked again', () => {
      it.each([
        'created',
        'waiting_for_limit',
        'completed',
        'skipped',
      ] as const)('should refuse it while the first is %s', async (status) => {
        await store.insert(improvementIn(status));

        await expect(
          store.insert(createdImprovement(SAME_WORK)),
        ).rejects.toThrow(UNIQUE);
      });

      it.each(['failed', 'cancelled'] as const)(
        'should take it once the first is %s',
        async (status) => {
          await store.insert(improvementIn(status));
          const again = createdImprovement(SAME_WORK);

          await store.insert(again);

          expect(await store.repository.findById(again.id)).not.toBeNull();
        },
      );
    });

    describe('when the file has an open improvement', () => {
      it.each(['created', 'waiting_for_limit', 'awaiting_approval'] as const)(
        'should refuse a second one while the first is %s',
        async (status) => {
          await store.insert(improvementIn(status));

          await expect(
            store.insert(createdImprovement(anotherOf(2))),
          ).rejects.toThrow(UNIQUE);
        },
      );

      it.each(['completed', 'skipped', 'failed', 'cancelled'] as const)(
        'should take a second one once the first is %s',
        async (status) => {
          await store.insert(improvementIn(status));

          await store.insert(createdImprovement(anotherOf(2)));

          expect(await store.repository.list({})).toHaveLength(2);
        },
      );
    });
  });

  describe('save', () => {
    it('should store the changes and give back the next version', async () => {
      const improvement = improvementIn('generating');
      await store.insert(improvement);
      improvement.openAttempt(minutesIn(STEP_MINUTE.attemptOpened));
      improvement.recordGeneration(
        generatedOf(),
        minutesIn(STEP_MINUTE.generated),
      );

      const saved = await store.save(improvement);

      expect(saved.version).toBe(2);
      expect(saved.status).toBe('verifying');
      expect((await stored()).state).toEqual(saved.state);
    });

    it('should store the attempts each save opened or changed', async () => {
      const improvement = improvementIn('verifying');
      await store.insert(improvement);
      improvement.recordVerdict(reportOf('rejected'), AT);
      const judged = await store.save(improvement);
      judged.openAttempt(AT);

      const saved = await store.save(judged);

      expect(saved.version).toBe(3);
      expect((await stored()).attempts).toEqual(saved.attempts);
      expect(saved.attempts.map((attempt) => attempt.isOpen)).toEqual([
        false,
        true,
      ]);
    });

    describe('when the improvement changed since it was read', () => {
      it('should throw StaleImprovementError and keep the other change', async () => {
        await store.insert(improvementIn('generating'));
        const cancelling = await stored();
        const working = await stored();
        cancelling.cancel(AT);
        working.openAttempt(AT);

        await store.save(cancelling);

        await expect(store.save(working)).rejects.toThrow(
          new StaleImprovementError(
            `The improvement ${IMPROVEMENT_ID} is not at the version 1 any ` +
              'more, or is not stored.',
          ),
        );
        expect((await stored()).status).toBe('cancelled');
        expect((await stored()).attempts).toEqual([]);
      });
    });

    describe('when the improvement was never stored', () => {
      it('should throw StaleImprovementError', async () => {
        await expect(store.save(createdImprovement())).rejects.toThrow(
          StaleImprovementError,
        );
      });
    });
  });
});
