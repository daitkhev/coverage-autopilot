import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import { Repository } from '#repositories/domain/entities/repository.entity';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';
import { SqliteRepositoryRepository } from '#repositories/infrastructure/persistence/sqlite-repository.repository';
import { SchemaRows, STORED_TIME } from '#tests/support/schema-rows';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const FIRST_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_ID = '00000000-0000-4000-8000-000000000002';
const CONNECTED_AT = Instant.parse(STORED_TIME);
const HEAD = CommitSha.create('b'.repeat(40));

let database: TemporaryDatabase;
let runner: SqliteTransactionRunner;
let store: SqliteRepositoryRepository;

function repository(
  id: string,
  address = 'https://github.com/acme/widgets',
): Repository {
  return Repository.connect(RepositoryId.create(id), {
    url: RepositoryUrl.parse(address),
    defaultBranch: BranchName.create('main'),
    connectedAt: CONNECTED_AT,
  });
}

async function save(value: Repository): Promise<void> {
  await runner.run(async (transaction) => store.save(value, transaction));
}

beforeEach(() => {
  database = createMigratedDatabase();
  runner = new SqliteTransactionRunner(database.connection);
  store = new SqliteRepositoryRepository(database.connection);
});

afterEach(() => {
  database.remove();
});

describe('SqliteRepositoryRepository', () => {
  describe('save', () => {
    it('should keep a new repository as it was connected', async () => {
      await save(repository(FIRST_ID));

      const found = await store.findById(RepositoryId.create(FIRST_ID));

      expect(found?.id.value).toBe(FIRST_ID);
      expect(found?.url.value).toBe('https://github.com/acme/widgets');
      expect(found?.defaultBranch.value).toBe('main');
      expect(found?.connectedAt.toString()).toBe(STORED_TIME);
      expect(found?.head).toBeNull();
      expect(found?.threshold).toBeNull();
      expect(found?.installMode).toBeNull();
    });

    it.each(['trusted', 'sandboxed'] as const)(
      'should keep the %s install a person chose for a repository',
      async (mode) => {
        const value = repository(FIRST_ID);
        await save(value);
        value.changeInstallMode(mode);

        await save(value);

        const found = await store.findById(value.id);
        expect(found?.installMode).toBe(mode);
      },
    );

    it('should forget the install mode once it is cleared', async () => {
      const value = repository(FIRST_ID);
      value.changeInstallMode('trusted');
      await save(value);
      value.changeInstallMode(null);

      await save(value);

      const found = await store.findById(value.id);
      expect(found?.installMode).toBeNull();
    });

    it('should keep the threshold a person gave a repository', async () => {
      const value = repository(FIRST_ID);
      await save(value);
      value.changeThreshold(ThresholdPercentage.create(95));

      await save(value);

      const found = await store.findById(value.id);
      expect(found?.threshold?.value).toBe(95);
    });

    it('should forget the threshold once it is cleared', async () => {
      const value = repository(FIRST_ID);
      value.changeThreshold(ThresholdPercentage.create(95));
      await save(value);
      value.changeThreshold(null);

      await save(value);

      const found = await store.findById(value.id);
      expect(found?.threshold).toBeNull();
    });

    it('should keep the head of a repository saved before', async () => {
      const value = repository(FIRST_ID);
      await save(value);
      value.recordHead({ commit: HEAD, readAt: CONNECTED_AT });

      await save(value);

      const found = await store.findById(value.id);
      expect(found?.head?.commit.value).toBe(HEAD.value);
      expect(found?.head?.readAt.toString()).toBe(STORED_TIME);
    });

    it('should write the owner and the name in their own columns', async () => {
      await save(repository(FIRST_ID, 'https://github.com/Acme/Widgets'));

      expect(
        database.connection
          .prepare('SELECT owner, name FROM repositories')
          .get(),
      ).toEqual({ owner: 'Acme', name: 'Widgets' });
    });

    it('should leave nothing when the transaction rolls back', async () => {
      const failure = new Error('stop');

      await expect(
        runner.run(async (transaction) => {
          await store.save(repository(FIRST_ID), transaction);
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(await store.list()).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should answer an unknown id with null', async () => {
      expect(await store.findById(RepositoryId.create(FIRST_ID))).toBeNull();
    });

    it('should read inside the transaction it is given', async () => {
      const found = await runner.run(async (transaction) => {
        await store.save(repository(FIRST_ID), transaction);
        return store.findById(RepositoryId.create(FIRST_ID), transaction);
      });

      expect(found?.id.value).toBe(FIRST_ID);
    });

    describe('when a row is not one the code writes', () => {
      it('should throw rather than give a broken repository', async () => {
        new SchemaRows(database.connection).repository({
          id: FIRST_ID,
          url: 'not an address',
        });

        await expect(async () =>
          store.findById(RepositoryId.create(FIRST_ID)),
        ).rejects.toThrow('not the HTTPS address');
      });
    });
  });

  describe('findByUrl', () => {
    it('should find the repository of an owner and a name in any case', async () => {
      await save(repository(FIRST_ID, 'https://github.com/Acme/Widgets'));

      const found = await store.findByUrl(
        RepositoryUrl.parse('https://github.com/acme/widgets.git'),
      );

      expect(found?.id.value).toBe(FIRST_ID);
    });

    it('should answer another repository with null', async () => {
      await save(repository(FIRST_ID));

      expect(
        await store.findByUrl(
          RepositoryUrl.parse('https://github.com/acme/gadgets'),
        ),
      ).toBeNull();
    });

    it('should read inside the transaction it is given', async () => {
      const found = await runner.run(async (transaction) => {
        await store.save(repository(FIRST_ID), transaction);
        return store.findByUrl(
          RepositoryUrl.parse('https://github.com/acme/widgets'),
          transaction,
        );
      });

      expect(found?.id.value).toBe(FIRST_ID);
    });
  });

  describe('list', () => {
    it('should give every repository, the oldest connection first', async () => {
      await save(repository(SECOND_ID, 'https://github.com/acme/gadgets'));
      await save(
        Repository.connect(RepositoryId.create(FIRST_ID), {
          url: RepositoryUrl.parse('https://github.com/acme/widgets'),
          defaultBranch: BranchName.create('trunk'),
          connectedAt: CONNECTED_AT.plusMilliseconds(1),
        }),
      );

      const names = (await store.list()).map((found) => found.url.fullName);

      expect(names).toEqual(['acme/gadgets', 'acme/widgets']);
    });
  });
});
