import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import { InvalidStoredDocumentError } from '#coverage/infrastructure/errors/invalid-stored-document.error';
import { UnknownDocumentVersionError } from '#coverage/infrastructure/errors/unknown-document-version.error';
import { SqliteCoverageSnapshotRepository } from '#coverage/infrastructure/persistence/sqlite-coverage-snapshot.repository';
import { SchemaRows } from '#tests/support/schema-rows';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

/** Documents as the first version of the service wrote them. */
const VERSION_1 = {
  detected_project:
    '{"version":1,"testRunner":"vitest","testRunnerVersion":"4.1.12",' +
    '"packageManager":"npm","configFile":"vitest.config.ts"}',
  scan_parameters:
    '{"version":1,"testRunner":"vitest","testRunnerVersion":"4.1.12",' +
    '"coverageProvider":"v8","fileListRule":"default-sources-v1"}',
  unmeasured_files:
    '{"version":1,"testRunOutput":"artifact-1","files":[{"path":' +
    '"src/broken.ts","reason":"parse_failed","toolMessage":"\')\' expected."}]}',
  uncovered:
    '{"version":1,"uncoveredLines":[{"start":6,"end":9}],' +
    '"openBranchLines":[6],"uncoveredFunctions":[{"name":"halve","line":5}]}',
};

let database: TemporaryDatabase;
let schema: SchemaRows;

function storeSample(overrides: Partial<typeof VERSION_1> = {}): string {
  const sample = { ...VERSION_1, ...overrides };
  const repositoryId = schema.repository();
  const snapshotId = schema.snapshot(repositoryId, {
    origin_key: 'scan:sample',
    detected_project: sample.detected_project,
    scan_parameters: sample.scan_parameters,
    unmeasured_files: sample.unmeasured_files,
  });
  insertFile(database.connection, snapshotId, sample.uncovered);
  return snapshotId;
}

function insertFile(
  connection: DatabaseSync,
  snapshotId: string,
  uncovered: string,
): void {
  connection
    .prepare(
      'INSERT INTO file_coverages (snapshot_id, file_path, state, ' +
        'lines_covered, lines_total, branches_covered, branches_total, ' +
        'statements_covered, statements_total, functions_covered, ' +
        'functions_total, uncovered) ' +
        "VALUES (?, 'src/used.ts', 'measured', 2, 5, 1, 2, 1, 4, 1, 2, ?)",
    )
    .run(snapshotId, uncovered);
}

async function readSample(): Promise<CoverageSnapshot | null> {
  return new SqliteCoverageSnapshotRepository(
    database.connection,
  ).findByOriginKey('scan:sample');
}

beforeEach(() => {
  database = createMigratedDatabase();
  schema = new SchemaRows(database.connection);
});

afterEach(() => {
  database.remove();
});

describe('the stored documents of a snapshot', () => {
  it('should read the project, the parameters and the unmeasured files', async () => {
    storeSample();

    const snapshot = await readSample();

    expect(snapshot?.project.configFile?.value).toBe('vitest.config.ts');
    expect(snapshot?.parameters.coverageProvider).toBe('v8');
    expect(snapshot?.testRunOutput).toBe('artifact-1');
    expect(snapshot?.unmeasured.map((file) => file.reason)).toEqual([
      'parse_failed',
    ]);
  });

  it('should read a snapshot of the first version as one with no test counted', async () => {
    storeSample();

    expect((await readSample())?.tests).toBeNull();
  });

  it('should read the tests the second version counts', async () => {
    storeSample({
      unmeasured_files:
        '{"version":2,"testRunOutput":"artifact-1","files":[],' +
        '"tests":{"ran":53,"failed":33}}',
    });

    expect((await readSample())?.tests).toEqual({ ran: 53, failed: 33 });
  });

  it('should refuse a first version that counts its tests', async () => {
    storeSample({
      unmeasured_files:
        '{"version":1,"testRunOutput":null,"files":[],' +
        '"tests":{"ran":1,"failed":0}}',
    });

    await expect(readSample()).rejects.toThrow(InvalidStoredDocumentError);
  });

  it('should read the counters and the uncovered code of a file', async () => {
    storeSample();

    const [file] = (await readSample())?.files ?? [];

    expect(file?.counters.of('statements').total).toBe(4);
    expect(file?.counters.of('lines').covered).toBe(2);
    expect(file?.uncovered.functions).toEqual([{ name: 'halve', line: 5 }]);
  });

  describe('when a document has a version this service does not know', () => {
    it('should throw UnknownDocumentVersionError, which is not retried', async () => {
      storeSample({
        scan_parameters: VERSION_1.scan_parameters.replace(
          '"version":1',
          '"version":2',
        ),
      });

      const reading = readSample();

      await expect(reading).rejects.toThrow(
        new UnknownDocumentVersionError(
          'The scan_parameters document has the version 2, and this ' +
            'service reads the version 1.',
        ),
      );
      await expect(reading).rejects.toMatchObject({
        code: 'unknown_document_version',
        retryable: false,
      });
    });

    it('should name every version a document of several versions has', async () => {
      storeSample({
        unmeasured_files:
          '{"version":3,"testRunOutput":null,"files":[],"tests":null}',
      });

      await expect(readSample()).rejects.toThrow(
        new UnknownDocumentVersionError(
          'The unmeasured_files document has the version 3, and this ' +
            'service reads the versions 1 to 2.',
        ),
      );
    });

    it.each([
      ['no version before the first', '0'],
      ['a part of a version', '1.5'],
      ['a version in words', '"2"'],
    ])('should refuse %s', async (_case, version) => {
      storeSample({
        unmeasured_files: `{"version":${version},"testRunOutput":null,"files":[]}`,
      });

      await expect(readSample()).rejects.toThrow(UnknownDocumentVersionError);
    });
  });

  describe('when a document of a known version lacks its shape', () => {
    it('should throw InvalidStoredDocumentError, which is not retried', async () => {
      storeSample({ uncovered: '{"version":1,"uncoveredLines":{}}' });

      const reading = readSample();

      await expect(reading).rejects.toThrow(InvalidStoredDocumentError);
      await expect(reading).rejects.toMatchObject({
        code: 'invalid_stored_document',
        retryable: false,
      });
    });
  });

  describe('when a document carries no version', () => {
    it('should throw UnknownDocumentVersionError', async () => {
      storeSample({ detected_project: '[]' });

      await expect(readSample()).rejects.toThrow(UnknownDocumentVersionError);
    });
  });
});
