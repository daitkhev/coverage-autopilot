import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MIGRATIONS_DIRECTORY,
  readMigrations,
} from '#infrastructure/database/migration-files';
import { migrateDatabase } from '#infrastructure/database/sqlite-migrator';
import { SchemaRows, STORED_TIME } from '#tests/support/schema-rows';
import {
  createEmptyDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const MIGRATIONS = readMigrations(MIGRATIONS_DIRECTORY);
const FOREIGN_KEY = 'FOREIGN KEY constraint failed';

/** An improvement as the first version of the schema stored it. */
const FIRST_VERSION_IMPROVEMENT =
  'INSERT INTO improvements (id, repository_id, source_snapshot_id, ' +
  'base_commit, target_file, status, request_key, request_fingerprint, ' +
  'quality_policy, generator_config, max_attempts, max_tokens, ' +
  'time_limit_ms, tokens_used, phase_started_at, version, created_at, ' +
  'updated_at) ' +
  "VALUES ('i1', :repositoryId, :snapshotId, :commit, :filePath, " +
  "'verifying', 'key', 'fingerprint', '{\"version\":1}', " +
  '\'{"version":1}\', 3, 200000, 1800000, 36000, :time, 4, :time, :time)';

let database: TemporaryDatabase;
let rows: SchemaRows;

/** A database of the first version that holds work in progress. */
function writeFirstVersion(): string {
  migrateDatabase(database.connection, MIGRATIONS.slice(0, 1));
  const target = rows.target();
  database.connection.prepare(FIRST_VERSION_IMPROVEMENT).run({
    ...target,
    commit: 'a'.repeat(40),
    time: STORED_TIME,
  });
  rows.attempt('i1');
  return target.repositoryId;
}

beforeEach(() => {
  database = createEmptyDatabase();
  rows = new SchemaRows(database.connection);
});

afterEach(() => {
  database.remove();
});

describe('a database of the first version', () => {
  it('should keep an improvement in progress, with no wait counted', () => {
    writeFirstVersion();

    const report = migrateDatabase(database.connection, MIGRATIONS);

    expect(report).toEqual({ from: 1, to: MIGRATIONS.length });
    expect(
      database.connection
        .prepare(
          'SELECT status, max_tokens, tokens_used, version, resumes_at, ' +
            "limit_waits FROM improvements WHERE id = 'i1'",
        )
        .get(),
    ).toEqual({
      status: 'verifying',
      max_tokens: 200_000,
      tokens_used: 36_000,
      version: 4,
      resumes_at: null,
      limit_waits: 0,
    });
  });

  it('should keep the attempts tied to their improvement', () => {
    writeFirstVersion();

    migrateDatabase(database.connection, MIGRATIONS);

    expect(
      database.connection
        .prepare('SELECT improvement_id, number FROM attempts')
        .all(),
    ).toEqual([{ improvement_id: 'i1', number: 1 }]);
    expect(() => {
      rows.attempt('no-such-improvement');
    }).toThrow(FOREIGN_KEY);
  });

  it('should move the counters of a file out of its document', () => {
    writeFirstVersion();
    database.connection.exec(
      "UPDATE file_coverages SET uncovered = '" +
        '{"version":1,"statements":{"covered":3,"total":7},"functions":' +
        '{"covered":1,"total":2},"uncoveredLines":[{"start":4,"end":6}],' +
        '"openBranchLines":[4],"uncoveredFunctions":[]}\'',
    );

    migrateDatabase(database.connection, MIGRATIONS);

    expect(
      database.connection
        .prepare(
          'SELECT statements_covered, statements_total, functions_covered, ' +
            'functions_total, uncovered FROM file_coverages',
        )
        .all(),
    ).toEqual([
      {
        statements_covered: 3,
        statements_total: 7,
        functions_covered: 1,
        functions_total: 2,
        uncovered:
          '{"version":1,"uncoveredLines":[{"start":4,"end":6}],' +
          '"openBranchLines":[4],"uncoveredFunctions":[]}',
      },
    ]);
  });

  it('should count nothing for a file whose document held no counter', () => {
    writeFirstVersion();

    migrateDatabase(database.connection, MIGRATIONS);

    expect(
      database.connection
        .prepare(
          'SELECT statements_covered, statements_total, functions_covered, ' +
            'functions_total, uncovered FROM file_coverages',
        )
        .all(),
    ).toEqual([
      {
        statements_covered: 0,
        statements_total: 0,
        functions_covered: 0,
        functions_total: 0,
        uncovered: '{"version":1}',
      },
    ]);
  });

  it('should keep an improvement in automatic mode, with its baseline', () => {
    writeFirstVersion();
    database.connection.exec(
      'UPDATE improvements SET mutation_baseline = \'{"version":1}\'',
    );

    migrateDatabase(database.connection, MIGRATIONS);

    expect(
      database.connection
        .prepare(
          'SELECT mode, failure_reason, failure_message, skip_reason, ' +
            'skip_message, verification_baseline FROM improvements',
        )
        .get(),
    ).toEqual({
      mode: 'automatic',
      failure_reason: null,
      failure_message: null,
      skip_reason: null,
      skip_message: null,
      verification_baseline: '{"version":1}',
    });
  });

  it('should give a failure of then a sentence that says it had none', () => {
    writeFirstVersion();
    database.connection.exec(
      "UPDATE improvements SET status = 'failed', " +
        "failure_reason = 'stale_snapshot'",
    );

    migrateDatabase(database.connection, MIGRATIONS);

    expect(
      database.connection
        .prepare('SELECT failure_reason, failure_message FROM improvements')
        .get(),
    ).toEqual({
      failure_reason: 'stale_snapshot',
      failure_message:
        'The improvement failed before its failures kept a sentence.',
    });
  });

  it('should leave an attempt of then with no output of the generator', () => {
    writeFirstVersion();

    migrateDatabase(database.connection, MIGRATIONS);

    expect(
      database.connection
        .prepare('SELECT generation_output FROM attempts')
        .get(),
    ).toEqual({ generation_output: null });
  });

  it('should leave a repository with no head until a check reads one', () => {
    const repositoryId = writeFirstVersion();

    migrateDatabase(database.connection, MIGRATIONS);

    expect(
      database.connection
        .prepare(
          'SELECT head_commit, head_checked_at FROM repositories WHERE id = ?',
        )
        .get(repositoryId),
    ).toEqual({ head_commit: null, head_checked_at: null });
  });
});
