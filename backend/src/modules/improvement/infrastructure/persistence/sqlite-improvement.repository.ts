import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { Inject, Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

import { Improvement } from '#improvement/domain/entities/improvement.entity';
import { StaleImprovementError } from '#improvement/domain/errors/stale-improvement.error';
import type {
  ImprovementFilter,
  ImprovementRepository,
  ImprovementTarget,
  LatestImprovement,
} from '#improvement/domain/repositories/improvement.repository';
import type { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import type { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import type { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import {
  attemptColumns,
  attemptFrom,
} from '#improvement/infrastructure/persistence/attempt-rows';
import {
  attemptRowSchema,
  improvementRowSchema,
  latestImprovementRowSchema,
} from '#improvement/infrastructure/persistence/improvement-documents.schema';
import {
  improvementColumns,
  improvementFrom,
  latestImprovementFrom,
} from '#improvement/infrastructure/persistence/improvement-rows';
import {
  INSERT_IMPROVEMENT,
  IS_ACTIVE,
  IS_OPEN,
  LATEST_BY_TARGET,
  LIST_IMPROVEMENTS,
  SELECT_ATTEMPTS,
  SELECT_IMPROVEMENTS,
  UPDATE_IMPROVEMENT,
  UPSERT_ATTEMPT,
} from '#improvement/infrastructure/persistence/improvement-statements';
import { DatabaseIntegrityError } from '#infrastructure/database/errors/database-integrity.error';
import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import { DomainError } from '#kernel/errors/domain.error';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Transaction } from '#kernel/transaction/transaction';

/**
 * What reading a row this service would not write raises: a text that is
 * not JSON, a document of another shape, or a value the domain refuses.
 * Anything else is a fault of the database itself and is passed on.
 */
function isBadRow(error: unknown): error is Error {
  return (
    error instanceof SyntaxError ||
    error instanceof ZodError ||
    error instanceof DomainError
  );
}

/** What is read from a row, or the fault of a row this service would not write. */
function fromRow<Value>(read: () => Value): Value {
  try {
    return read();
  } catch (error) {
    if (isBadRow(error)) {
      throw new DatabaseIntegrityError(
        `A stored improvement is not one this service writes: ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Improvements in SQLite, in plain SQL: one row for the improvement and
 * one for each attempt. A row read back is parsed before it becomes an
 * aggregate, and a row this service would not write is a fault of the
 * database, raised as one.
 */
@Injectable()
export class SqliteImprovementRepository implements ImprovementRepository {
  private readonly connection: DatabaseSync;

  public constructor(@Inject(SQLITE_CONNECTION) connection: DatabaseSync) {
    this.connection = connection;
  }

  public async insert(
    improvement: Improvement,
    transaction: Transaction,
  ): Promise<void> {
    const connection = SqliteTransaction.connectionOf(transaction);
    connection
      .prepare(INSERT_IMPROVEMENT)
      .run(improvementColumns(improvement, improvement.version));
    this.writeAttempts(connection, improvement);
    return Promise.resolve();
  }

  public async save(
    improvement: Improvement,
    transaction: Transaction,
  ): Promise<Improvement> {
    const connection = SqliteTransaction.connectionOf(transaction);
    const read = improvement.version;
    const { changes } = connection.prepare(UPDATE_IMPROVEMENT).run({
      ...improvementColumns(improvement, read + 1),
      read_version: read,
    });
    if (changes === 0) {
      throw new StaleImprovementError(
        `The improvement ${improvement.id.value} is not at the version ` +
          `${String(read)} any more, or is not stored.`,
      );
    }
    this.writeAttempts(connection, improvement);
    return Promise.resolve(
      Improvement.restore({ ...improvement.state, version: read + 1 }),
    );
  }

  public async findById(
    id: ImprovementId,
    transaction?: Transaction,
  ): Promise<Improvement | null> {
    return this.findOne(transaction, 'id = ?', [id.value]);
  }

  public async findByRequestKey(
    key: RequestKey,
    transaction?: Transaction,
  ): Promise<Improvement | null> {
    return this.findOne(transaction, 'request_key = ?', [key.value]);
  }

  public async findActiveByFingerprint(
    fingerprint: RequestFingerprint,
    transaction?: Transaction,
  ): Promise<Improvement | null> {
    return this.findOne(
      transaction,
      `request_fingerprint = ? AND ${IS_ACTIVE}`,
      [fingerprint.value],
    );
  }

  public async findOpenByTarget(
    target: ImprovementTarget,
    transaction?: Transaction,
  ): Promise<Improvement | null> {
    return this.findOne(
      transaction,
      `repository_id = ? AND target_file = ? AND ${IS_OPEN}`,
      [target.repositoryId.value, target.targetFile.value],
    );
  }

  public async list(filter: ImprovementFilter): Promise<Improvement[]> {
    const rows = this.connection.prepare(LIST_IMPROVEMENTS).all({
      repository_id: filter.repositoryId?.value ?? null,
      status: filter.status ?? null,
      target_file: filter.targetFile?.value ?? null,
    });
    return Promise.resolve(
      rows.map((row) => this.improvementOf(this.connection, row)),
    );
  }

  public async latestByTarget(
    repositoryId: RepositoryId,
  ): Promise<LatestImprovement[]> {
    const rows = this.connection
      .prepare(LATEST_BY_TARGET)
      .all(repositoryId.value);
    return Promise.resolve(
      rows.map((row) =>
        fromRow(() =>
          latestImprovementFrom(latestImprovementRowSchema.parse(row)),
        ),
      ),
    );
  }

  private writeAttempts(
    connection: DatabaseSync,
    improvement: Improvement,
  ): void {
    const upsert = connection.prepare(UPSERT_ATTEMPT);
    for (const attempt of improvement.attempts) {
      upsert.run(attemptColumns(improvement.id.value, attempt));
    }
  }

  private findOne(
    transaction: Transaction | undefined,
    condition: string,
    values: readonly SQLInputValue[],
  ): Promise<Improvement | null> {
    const connection =
      transaction === undefined
        ? this.connection
        : SqliteTransaction.connectionOf(transaction);
    const row = connection
      .prepare(`${SELECT_IMPROVEMENTS} WHERE ${condition}`)
      .get(...values);
    return Promise.resolve(
      row === undefined ? null : this.improvementOf(connection, row),
    );
  }

  private improvementOf(connection: DatabaseSync, value: unknown): Improvement {
    return fromRow(() => {
      const row = improvementRowSchema.parse(value);
      const attempts = connection
        .prepare(SELECT_ATTEMPTS)
        .all(row.id)
        .map((attempt) => attemptFrom(attemptRowSchema.parse(attempt)));
      return improvementFrom(row, attempts);
    });
  }
}
