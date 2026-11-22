import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Improvement } from '#improvement/domain/entities/improvement.entity';
import { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  improvementIn,
  type JourneySpec,
} from '#tests/support/improvement-journeys';
import {
  anotherOf,
  IMPROVEMENT_STORES,
  type ImprovementStore,
  OTHER_FILE,
  OTHER_REPOSITORY_ID,
  OTHER_SNAPSHOT_ID,
} from '#tests/support/improvement-stores';
import {
  hashOf,
  IMPROVEMENT_ID,
  improvementIdOf,
  minutesIn,
  REPOSITORY_ID,
  requestOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';

const TARGET = {
  repositoryId: RepositoryId.create(REPOSITORY_ID),
  targetFile: FilePath.create(TARGET_FILE),
};

const IN_OTHER_REPOSITORY: JourneySpec = {
  repositoryId: OTHER_REPOSITORY_ID,
  sourceSnapshotId: OTHER_SNAPSHOT_ID,
};

/** An improvement of its own request, created so many minutes in. */
function createdIn(minutes: number, spec: JourneySpec): Improvement {
  return Improvement.create(
    improvementIdOf(spec.id),
    requestOf(spec),
    minutesIn(minutes),
  );
}

describe.each(IMPROVEMENT_STORES)('%s', (_name, open) => {
  let store: ImprovementStore;

  beforeEach(() => {
    store = open();
  });

  afterEach(() => {
    store.remove();
  });

  async function insert(...improvements: Improvement[]): Promise<void> {
    for (const improvement of improvements) {
      await store.insert(improvement);
    }
  }

  async function idsOf(found: Promise<Improvement[]>): Promise<string[]> {
    return (await found).map((improvement) => improvement.id.value);
  }

  describe('findById and findByRequestKey', () => {
    it('should find the improvement by its id and by its key', async () => {
      await insert(improvementIn('verifying'));

      const byKey = await store.repository.findByRequestKey(
        RequestKey.create('request-1'),
      );

      expect(byKey?.id.value).toBe(IMPROVEMENT_ID);
      expect((await store.repository.findById(improvementIdOf()))?.status).toBe(
        'verifying',
      );
    });

    it('should answer an id or a key that is not stored with null', async () => {
      await insert(improvementIn('created'));

      expect(
        await store.repository.findById(improvementIdOf(anotherOf(2).id)),
      ).toBeNull();
      expect(
        await store.repository.findByRequestKey(RequestKey.create('request-2')),
      ).toBeNull();
    });
  });

  describe('findActiveByFingerprint', () => {
    const fingerprint = RequestFingerprint.create(hashOf('f'));

    it('should find the try of the work that did not fail', async () => {
      const again = { ...anotherOf(2), fingerprint: hashOf('f') };
      await insert(improvementIn('failed'), improvementIn('completed', again));

      const found = await store.repository.findActiveByFingerprint(fingerprint);

      expect(found?.id.value).toBe(again.id);
    });

    it('should find none when every try failed or was cancelled', async () => {
      const again = { ...anotherOf(2), fingerprint: hashOf('f') };
      await insert(improvementIn('failed'), improvementIn('cancelled', again));

      expect(
        await store.repository.findActiveByFingerprint(fingerprint),
      ).toBeNull();
    });
  });

  describe('findOpenByTarget', () => {
    it.each(['created', 'waiting_for_limit', 'awaiting_approval'] as const)(
      'should find a %s improvement of the file',
      async (status) => {
        await insert(improvementIn(status));

        expect((await store.repository.findOpenByTarget(TARGET))?.status).toBe(
          status,
        );
      },
    );

    it('should find none when the improvement of the file is over', async () => {
      await insert(
        improvementIn('completed'),
        improvementIn('created', { ...anotherOf(2), targetFile: OTHER_FILE }),
        improvementIn('created', { ...anotherOf(3), ...IN_OTHER_REPOSITORY }),
      );

      expect(await store.repository.findOpenByTarget(TARGET)).toBeNull();
    });

    it('should see what the transaction of the caller wrote', async () => {
      const found = await store.transactions.run(async (transaction) => {
        await store.repository.insert(improvementIn('created'), transaction);
        return store.repository.findOpenByTarget(TARGET, transaction);
      });

      expect(found?.id.value).toBe(IMPROVEMENT_ID);
    });
  });

  describe('list', () => {
    const [first, second, third, alsoThird] = [2, 3, 4, 5].map(
      (digit) => anotherOf(digit).id,
    );

    beforeEach(async () => {
      const cancelled = createdIn(1, {
        ...anotherOf(2),
        targetFile: OTHER_FILE,
      });
      cancelled.cancel(minutesIn(4));
      await insert(
        cancelled,
        createdIn(2, { ...anotherOf(3), ...IN_OTHER_REPOSITORY }),
        createdIn(3, { ...anotherOf(4), targetFile: OTHER_FILE }),
        createdIn(3, anotherOf(5)),
      );
    });

    it('should list every improvement, the newest first', async () => {
      expect(await idsOf(store.repository.list({}))).toEqual([
        alsoThird,
        third,
        second,
        first,
      ]);
    });

    it('should list the improvements of a repository', async () => {
      const repositoryId = RepositoryId.create(OTHER_REPOSITORY_ID);

      expect(await idsOf(store.repository.list({ repositoryId }))).toEqual([
        second,
      ]);
    });

    it('should list the improvements in a status', async () => {
      expect(
        await idsOf(store.repository.list({ status: 'cancelled' })),
      ).toEqual([first]);
    });

    it('should list the improvements of a file with every filter', async () => {
      const filter = {
        repositoryId: RepositoryId.create(REPOSITORY_ID),
        status: 'created',
        targetFile: FilePath.create(OTHER_FILE),
      } as const;

      expect(await idsOf(store.repository.list(filter))).toEqual([third]);
    });
  });

  describe('latestByTarget', () => {
    const repositoryId = RepositoryId.create(REPOSITORY_ID);

    it('should give the newest improvement of each file of the repository, by path', async () => {
      const older = createdIn(1, anotherOf(2));
      older.cancel(minutesIn(2));
      const tied = createdIn(2, anotherOf(3));
      tied.cancel(minutesIn(2));
      await insert(
        older,
        tied,
        createdIn(2, anotherOf(4)),
        createdIn(1, { ...anotherOf(5), targetFile: OTHER_FILE }),
        createdIn(3, { ...anotherOf(6), ...IN_OTHER_REPOSITORY }),
      );

      expect(await store.repository.latestByTarget(repositoryId)).toEqual([
        {
          targetFile: FilePath.create(TARGET_FILE),
          id: improvementIdOf(anotherOf(4).id),
          status: 'created',
        },
        {
          targetFile: FilePath.create(OTHER_FILE),
          id: improvementIdOf(anotherOf(5).id),
          status: 'created',
        },
      ]);
    });

    it('should give nothing for a repository with no improvement', async () => {
      await insert(createdIn(1, { ...anotherOf(2), ...IN_OTHER_REPOSITORY }));

      expect(await store.repository.latestByTarget(repositoryId)).toEqual([]);
    });
  });
});
