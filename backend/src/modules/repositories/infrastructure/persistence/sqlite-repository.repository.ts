import type { DatabaseSync } from 'node:sqlite';

import { Inject, Injectable } from '@nestjs/common';

import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';
import {
  Repository,
  type RepositoryHead,
} from '#repositories/domain/entities/repository.entity';
import type { RepositoryRepository } from '#repositories/domain/repositories/repository.repository';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import {
  type RepositoryRow,
  repositoryRowSchema,
} from '#repositories/infrastructure/persistence/repository-row.schema';

const COLUMNS =
  'id, owner, name, url, default_branch, connected_at, head_commit, ' +
  'head_checked_at';

/** The host does not tell letters of a different case apart in a name. */
const FIND_BY_OWNER_AND_NAME =
  `SELECT ${COLUMNS} FROM repositories ` +
  'WHERE owner = ? COLLATE NOCASE AND name = ? COLLATE NOCASE';

/** Only the head changes after a repository is connected. */
const SAVE =
  `INSERT INTO repositories (${COLUMNS}) ` +
  'VALUES (:id, :owner, :name, :url, :default_branch, :connected_at, ' +
  ':head_commit, :head_checked_at) ' +
  'ON CONFLICT (id) DO UPDATE SET head_commit = excluded.head_commit, ' +
  'head_checked_at = excluded.head_checked_at';

function headOf(row: RepositoryRow): RepositoryHead | null {
  return row.head_commit === null
    ? null
    : {
        commit: CommitSha.create(row.head_commit),
        readAt: Instant.parse(row.head_checked_at),
      };
}

function repositoryOf(value: unknown): Repository {
  const row = repositoryRowSchema.parse(value);
  return Repository.restore(RepositoryId.create(row.id), {
    url: RepositoryUrl.parse(row.url),
    defaultBranch: BranchName.create(row.default_branch),
    connectedAt: Instant.parse(row.connected_at),
    head: headOf(row),
  });
}

function rowOf(repository: Repository): Record<string, string | null> {
  const head = repository.head;
  return {
    id: repository.id.value,
    owner: repository.url.owner,
    name: repository.url.name,
    url: repository.url.value,
    default_branch: repository.defaultBranch.value,
    connected_at: repository.connectedAt.toString(),
    head_commit: head?.commit.value ?? null,
    head_checked_at: head?.readAt.toString() ?? null,
  };
}

/**
 * The store of repositories in SQLite, in plain SQL. A row read back is
 * parsed before it becomes an aggregate, so a row the code did not write
 * fails here and not deep in a use case.
 */
@Injectable()
export class SqliteRepositoryRepository implements RepositoryRepository {
  private readonly connection: DatabaseSync;

  public constructor(@Inject(SQLITE_CONNECTION) connection: DatabaseSync) {
    this.connection = connection;
  }

  public findById(
    id: RepositoryId,
    transaction?: Transaction,
  ): Promise<Repository | null> {
    const row = this.connectionFor(transaction)
      .prepare(`SELECT ${COLUMNS} FROM repositories WHERE id = ?`)
      .get(id.value);
    return Promise.resolve(row === undefined ? null : repositoryOf(row));
  }

  public findByUrl(
    url: RepositoryUrl,
    transaction?: Transaction,
  ): Promise<Repository | null> {
    const row = this.connectionFor(transaction)
      .prepare(FIND_BY_OWNER_AND_NAME)
      .get(url.owner, url.name);
    return Promise.resolve(row === undefined ? null : repositoryOf(row));
  }

  public list(): Promise<Repository[]> {
    const rows = this.connection
      .prepare(`SELECT ${COLUMNS} FROM repositories ORDER BY connected_at, id`)
      .all();
    return Promise.resolve(rows.map(repositoryOf));
  }

  public save(repository: Repository, transaction: Transaction): Promise<void> {
    SqliteTransaction.connectionOf(transaction)
      .prepare(SAVE)
      .run(rowOf(repository));
    return Promise.resolve();
  }

  private connectionFor(transaction?: Transaction): DatabaseSync {
    return transaction === undefined
      ? this.connection
      : SqliteTransaction.connectionOf(transaction);
  }
}
