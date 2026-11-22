import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';

import { AppModule } from '#composition/app.module';
import { SqliteCoverageSnapshotRepository } from '#coverage/infrastructure/persistence/sqlite-coverage-snapshot.repository';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { Instant } from '#kernel/time/instant';
import {
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import { SchemaRows } from '#tests/support/schema-rows';
import { loadWith } from '#tests/support/service-variables';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

let database: TemporaryDatabase;
let rows: SchemaRows;
let service: HttpService;

/** The routes of the root module over the database, as a run wires them. */
async function routesOfTheService(): Promise<HttpService> {
  return startHttpService({
    imports: [
      AppModule.register({
        config: loadWith({}),
        connection: database.connection,
        logStream: new PassThrough(),
        life: {
          version: '0.0.0-test',
          startedAt: Instant.parse('2026-11-22T08:00:00.000Z'),
          stopping: false,
          stop: async () => Promise.resolve(),
        },
      }),
    ],
  });
}

/** `acme/widgets` with the fixture snapshot, as a scan stored it. */
async function scannedWidgets(): Promise<void> {
  rows.repository({
    id: REPOSITORY_ID,
    owner: 'acme',
    name: 'widgets',
    url: 'https://github.com/acme/widgets',
  });
  const snapshots = new SqliteCoverageSnapshotRepository(database.connection);
  await new SqliteTransactionRunner(database.connection).run(
    async (transaction) => snapshots.save(fixtureSnapshot(), transaction),
  );
}

beforeEach(async () => {
  database = createMigratedDatabase();
  rows = new SchemaRows(database.connection);
  await scannedWidgets();
  service = await routesOfTheService();
});

afterEach(async () => {
  await service.close();
  database.remove();
});

describe('the ports a module declares for the module above it', () => {
  describe('the coverage of a repository', () => {
    it('should show a repository with its newest snapshot and its open scan', async () => {
      const scanId = rows.job({
        serialization_key: REPOSITORY_ID,
        subject_id: REPOSITORY_ID,
      });

      const answer = await service.send(
        'GET',
        `/repositories/${REPOSITORY_ID}`,
      );

      expect(answer.status).toBe(200);
      expect(repositorySchema.parse(answer.body)).toMatchObject({
        id: REPOSITORY_ID,
        latestSnapshot: {
          id: SNAPSHOT_ID,
          files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
        },
        activeScanId: scanId,
      });
    });
  });
});
