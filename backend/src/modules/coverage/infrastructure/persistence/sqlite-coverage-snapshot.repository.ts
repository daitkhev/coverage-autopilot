import type { DatabaseSync } from 'node:sqlite';

import { Inject, Injectable } from '@nestjs/common';

import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import type { CoverageSnapshotRepository } from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import {
  fileRowSchema,
  snapshotRowSchema,
} from '#coverage/infrastructure/persistence/snapshot-documents.schema';
import {
  fileColumns,
  snapshotColumns,
  snapshotFrom,
} from '#coverage/infrastructure/persistence/snapshot-rows';
import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import type { Transaction } from '#kernel/transaction/transaction';

const SNAPSHOT_COLUMNS = [
  'id',
  'repository_id',
  'commit_sha',
  'origin_key',
  'detected_project',
  'scan_parameters',
  'unmeasured_files',
  'lines_covered',
  'lines_total',
  'branches_covered',
  'branches_total',
  'captured_at',
];

const FILE_COLUMNS = [
  'snapshot_id',
  'file_path',
  'state',
  'lines_covered',
  'lines_total',
  'branches_covered',
  'branches_total',
  'statements_covered',
  'statements_total',
  'functions_covered',
  'functions_total',
  'uncovered',
];

function insertInto(table: string, columns: readonly string[]): string {
  const names = columns.join(', ');
  const values = columns.map((column) => `:${column}`).join(', ');
  return `INSERT INTO ${table} (${names}) VALUES (${values})`;
}

const INSERT_SNAPSHOT = insertInto('coverage_snapshots', SNAPSHOT_COLUMNS);

const INSERT_FILE = insertInto('file_coverages', FILE_COLUMNS);

const SELECT_SNAPSHOT = `SELECT id, repository_id, commit_sha, origin_key,
    detected_project, scan_parameters, unmeasured_files, captured_at
  FROM coverage_snapshots`;

const SELECT_FILES = `SELECT file_path, state, lines_covered, lines_total,
    branches_covered, branches_total, statements_covered, statements_total,
    functions_covered, functions_total, uncovered
  FROM file_coverages WHERE snapshot_id = ? ORDER BY file_path`;

/**
 * Snapshots in SQLite: one row for the snapshot and one for every file
 * that has a state with counters. An unmeasured file has no row, so the
 * foreign key of an improvement can never name it as a target.
 */
@Injectable()
export class SqliteCoverageSnapshotRepository implements CoverageSnapshotRepository {
  private readonly connection: DatabaseSync;

  public constructor(@Inject(SQLITE_CONNECTION) connection: DatabaseSync) {
    this.connection = connection;
  }

  /**
   * Looks for the origin key before it inserts. The transaction holds the
   * write lock of the database, so nothing changes between the two, and
   * the unique index on the key stays as a safety net.
   */
  public async save(
    snapshot: CoverageSnapshot,
    transaction: Transaction,
  ): Promise<CoverageSnapshot> {
    const connection = SqliteTransaction.connectionOf(transaction);
    const stored = this.find(connection, 'origin_key', snapshot.originKey);
    if (stored === null) {
      this.insert(connection, snapshot);
    }
    return Promise.resolve(stored ?? snapshot);
  }

  public async findById(id: SnapshotId): Promise<CoverageSnapshot | null> {
    return Promise.resolve(this.find(this.connection, 'id', id.value));
  }

  public async findByOriginKey(
    originKey: string,
  ): Promise<CoverageSnapshot | null> {
    return Promise.resolve(this.find(this.connection, 'origin_key', originKey));
  }

  private insert(connection: DatabaseSync, snapshot: CoverageSnapshot): void {
    connection.prepare(INSERT_SNAPSHOT).run(snapshotColumns(snapshot));
    const insertFile = connection.prepare(INSERT_FILE);
    for (const file of snapshot.files) {
      insertFile.run(fileColumns(snapshot.id.value, file));
    }
  }

  private find(
    connection: DatabaseSync,
    column: 'id' | 'origin_key',
    value: string,
  ): CoverageSnapshot | null {
    const found = connection
      .prepare(`${SELECT_SNAPSHOT} WHERE ${column} = ?`)
      .get(value);
    if (found === undefined) {
      return null;
    }
    const row = snapshotRowSchema.parse(found);
    const files = connection
      .prepare(SELECT_FILES)
      .all(row.id)
      .map((file) => fileRowSchema.parse(file));
    return snapshotFrom(row, files);
  }
}
