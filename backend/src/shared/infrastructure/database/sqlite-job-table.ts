import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import { Inject, Injectable } from '@nestjs/common';

import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import type { Transaction } from '#kernel/transaction/transaction';

/** A job as `enqueue` writes it. Documents are JSON text. */
export interface NewJobRow {
  readonly id: string;
  readonly kind: string;
  readonly serializationKey: string;
  readonly idempotencyKey: string;
  readonly subjectId: string;
  readonly payload: string;
  readonly createdAt: string;
  /** `null` for a job that may start at once. */
  readonly notBefore: string | null;
}

/** What every read of a job gives, with its payload as JSON text. */
export interface JobFields {
  readonly id: string;
  readonly kind: string;
  readonly serializationKey: string;
  readonly subjectId: string;
  readonly payload: string;
  readonly runs: number;
}

/** A stored job, with its documents as JSON text. */
export interface JobRow extends JobFields {
  readonly status: string;
  readonly outcome: string | null;
  readonly createdAt: string;
  /** `null` until the first claim. */
  readonly startedAt: string | null;
  readonly updatedAt: string;
}

/** A pending job of a subject, as far as its wait goes. */
export interface PendingRow {
  readonly notBefore: string | null;
  /** Whether another job of its repository is leased. */
  readonly repositoryBusy: boolean;
}

/** The last progress a worker wrote for a leased job. */
export interface ProgressRow {
  readonly jobId: string;
  readonly progress: string;
  readonly updatedAt: string;
}

const JOB_COLUMNS = `id, kind, serialization_key, subject_id, payload, status,
  runs, outcome, created_at, started_at, updated_at`;

type StoredRecord = Readonly<Record<string, SQLOutputValue>>;

export function jobFieldsOf(record: StoredRecord): JobFields {
  return {
    id: String(record['id']),
    kind: String(record['kind']),
    serializationKey: String(record['serialization_key']),
    subjectId: String(record['subject_id']),
    payload: String(record['payload']),
    runs: Number(record['runs']),
  };
}

function textOrNull(value: SQLOutputValue | undefined): string | null {
  return value === undefined || value === null ? null : String(value);
}

function jobRowOf(record: StoredRecord): JobRow {
  return {
    ...jobFieldsOf(record),
    status: String(record['status']),
    outcome: textOrNull(record['outcome']),
    createdAt: String(record['created_at']),
    startedAt: textOrNull(record['started_at']),
    updatedAt: String(record['updated_at']),
  };
}

/**
 * The statements of the jobs table that the job queue runs. A write runs
 * in the transaction of the caller. A read is one statement on the
 * connection and waits for no writer.
 */
@Injectable()
export class SqliteJobTable {
  private readonly connection: DatabaseSync;

  public constructor(@Inject(SQLITE_CONNECTION) connection: DatabaseSync) {
    this.connection = connection;
  }

  public insert(transaction: Transaction, row: NewJobRow): void {
    SqliteTransaction.connectionOf(transaction)
      .prepare(
        `INSERT INTO jobs (id, kind, serialization_key, idempotency_key,
           subject_id, payload, status, runs, lease_token, not_before,
           created_at, updated_at)
         VALUES (:id, :kind, :serializationKey, :idempotencyKey,
           :subjectId, :payload, 'pending', 0, 0, :notBefore, :createdAt,
           :createdAt)`,
      )
      .run({ ...row });
  }

  /** The job that holds a key, read in the transaction that may add one. */
  public findByKey(
    transaction: Transaction,
    idempotencyKey: string,
  ): JobRow | undefined {
    const record = SqliteTransaction.connectionOf(transaction)
      .prepare(`SELECT ${JOB_COLUMNS} FROM jobs WHERE idempotency_key = ?`)
      .get(idempotencyKey);
    return record === undefined ? undefined : jobRowOf(record);
  }

  /** A job that has ended stays as it ended. */
  public cancel(
    transaction: Transaction,
    change: { readonly id: string; readonly now: string },
  ): void {
    SqliteTransaction.connectionOf(transaction)
      .prepare(
        `UPDATE jobs
         SET status = 'cancelled', lease_expires_at = NULL, updated_at = :now
         WHERE id = :id AND status IN ('pending', 'leased')`,
      )
      .run({ ...change });
  }

  /** Every job of the subject that has not ended. */
  public cancelSubject(
    transaction: Transaction,
    change: { readonly subjectId: string; readonly now: string },
  ): void {
    SqliteTransaction.connectionOf(transaction)
      .prepare(
        `UPDATE jobs
         SET status = 'cancelled', lease_expires_at = NULL, updated_at = :now
         WHERE subject_id = :subjectId AND status IN ('pending', 'leased')`,
      )
      .run({ ...change });
  }

  public find(id: string): JobRow | undefined {
    const record = this.connection
      .prepare(`SELECT ${JOB_COLUMNS} FROM jobs WHERE id = ?`)
      .get(id);
    return record === undefined ? undefined : jobRowOf(record);
  }

  /** The oldest pending job of the subject. */
  public pendingOf(subjectId: string): PendingRow | undefined {
    const record = this.connection
      .prepare(
        `SELECT not_before, EXISTS (
           SELECT 1 FROM jobs AS running
           WHERE running.status = 'leased'
             AND running.serialization_key = waiting.serialization_key
         ) AS repository_busy
         FROM jobs AS waiting
         WHERE subject_id = ? AND status = 'pending'
         ORDER BY created_at, id
         LIMIT 1`,
      )
      .get(subjectId);
    if (record === undefined) {
      return undefined;
    }
    const notBefore = record['not_before'] ?? null;
    return {
      notBefore: notBefore === null ? null : String(notBefore),
      repositoryBusy: Number(record['repository_busy']) === 1,
    };
  }

  /** A subject has one leased job at most, as its repository has. */
  public progressOf(subjectId: string): ProgressRow | undefined {
    const record = this.connection
      .prepare(
        `SELECT id, progress, progress_updated_at FROM jobs
         WHERE subject_id = ? AND status = 'leased'
           AND progress IS NOT NULL`,
      )
      .get(subjectId);
    return record === undefined
      ? undefined
      : {
          jobId: String(record['id']),
          progress: String(record['progress']),
          updatedAt: String(record['progress_updated_at']),
        };
  }
}
