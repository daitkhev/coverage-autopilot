import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';

/** Columns of a row and their values. A test overrides some of them. */
export type Row = Readonly<Record<string, SQLInputValue>>;

/** The rows an improvement needs: a repository, a snapshot and a file. */
export interface Target {
  readonly repositoryId: string;
  readonly snapshotId: string;
  readonly filePath: string;
}

/** A time in the one format the service stores. */
export const STORED_TIME = '2026-01-02T03:04:05.006Z';

const DOCUMENT = '{"version":1}';
const SHA1_DIGITS = 40;
const COMMIT = 'a'.repeat(SHA1_DIGITS);

/**
 * Writes rows of the schema that are valid unless a test says otherwise,
 * so each test names only the column it is about.
 */
export class SchemaRows {
  private readonly connection: DatabaseSync;
  private readonly ids = new SequentialIdGenerator();

  public constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  public repository(row: Row = {}): string {
    const id = this.ids.generate();
    this.insert('repositories', {
      id,
      owner: 'owner',
      name: `name-${id}`,
      url: `https://github.com/owner/name-${id}`,
      default_branch: 'main',
      connected_at: STORED_TIME,
      ...row,
    });
    return id;
  }

  public snapshot(repositoryId: string, row: Row = {}): string {
    const id = this.ids.generate();
    this.insert('coverage_snapshots', {
      id,
      repository_id: repositoryId,
      commit_sha: COMMIT,
      origin_key: `scan:${id}`,
      detected_project: DOCUMENT,
      scan_parameters: DOCUMENT,
      unmeasured_files: DOCUMENT,
      lines_covered: 0,
      lines_total: 1,
      branches_covered: 0,
      branches_total: 1,
      captured_at: STORED_TIME,
      ...row,
    });
    return id;
  }

  public file(snapshotId: string, filePath: string): void {
    this.insert('file_coverages', {
      snapshot_id: snapshotId,
      file_path: filePath,
      state: 'measured',
      lines_covered: 0,
      lines_total: 1,
      branches_covered: 0,
      branches_total: 1,
      uncovered: DOCUMENT,
    });
  }

  /** A repository with one snapshot that measured `src/a.ts`. */
  public target(): Target {
    const repositoryId = this.repository();
    const snapshotId = this.snapshot(repositoryId);
    const filePath = 'src/a.ts';
    this.file(snapshotId, filePath);
    return { repositoryId, snapshotId, filePath };
  }

  public improvement(target: Target, row: Row = {}): string {
    const id = this.ids.generate();
    this.insert('improvements', {
      id,
      repository_id: target.repositoryId,
      source_snapshot_id: target.snapshotId,
      base_commit: COMMIT,
      target_file: target.filePath,
      status: 'created',
      request_key: `key-${id}`,
      request_fingerprint: `fingerprint-${id}`,
      quality_policy: DOCUMENT,
      generator_config: DOCUMENT,
      max_attempts: 1,
      max_tokens: 1,
      time_limit_ms: 1,
      tokens_used: 0,
      limit_waits: 0,
      phase_started_at: STORED_TIME,
      version: 1,
      created_at: STORED_TIME,
      updated_at: STORED_TIME,
      ...row,
    });
    return id;
  }

  public attempt(improvementId: string, row: Row = {}): void {
    this.insert('attempts', {
      improvement_id: improvementId,
      number: 1,
      started_at: STORED_TIME,
      ...row,
    });
  }

  public job(row: Row = {}): string {
    const id = this.ids.generate();
    this.insert('jobs', {
      id,
      kind: 'scan',
      serialization_key: 'repository',
      idempotency_key: `scan:${id}`,
      subject_id: id,
      payload: DOCUMENT,
      status: 'pending',
      runs: 0,
      lease_token: 0,
      created_at: STORED_TIME,
      updated_at: STORED_TIME,
      ...row,
    });
    return id;
  }

  private insert(table: string, row: Row): void {
    const columns = Object.keys(row);
    const values = columns.map((column) => `:${column}`);
    this.connection
      .prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) ` +
          `VALUES (${values.join(', ')})`,
      )
      .run(row);
  }
}
