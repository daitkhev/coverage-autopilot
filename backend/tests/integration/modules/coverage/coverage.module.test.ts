import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Provider } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CancelScanHandler } from '#coverage/application/commands/cancel-scan/cancel-scan.handler';
import { RunScanHandler } from '#coverage/application/commands/run-scan/run-scan.handler';
import { CoverageApi } from '#coverage/application/coverage-api';
import { COVERAGE_SETTINGS } from '#coverage/application/coverage-settings';
import { TestRunnerUnavailableError } from '#coverage/application/errors/test-runner-unavailable.error';
import {
  TEST_RUNNERS,
  type TestRunner,
} from '#coverage/application/ports/test-runner.port';
import { GetScanHandler } from '#coverage/application/queries/get-scan/get-scan.handler';
import { ListSnapshotsHandler } from '#coverage/application/queries/list-snapshots/list-snapshots.handler';
import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
} from '#coverage/contracts/coverage-public-api';
import { CoverageModule } from '#coverage/coverage.module';
import { REPORT_FOLDER } from '#coverage/infrastructure/runners/sandboxed-test-runner.adapter';
import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { CLOCK } from '#kernel/time/clock';
import { ARTIFACT_STORE } from '#ports/artifact-store.port';
import { JOB_QUEUE } from '#ports/job-queue.port';
import { SANDBOX } from '#ports/sandbox.port';
import { TRANSACTION_MANAGER } from '#ports/transaction-manager.port';
import { REPOSITORIES_PUBLIC_API } from '#repositories/contracts/repositories-public-api';
import { FIRST_ID } from '#tests/support/coverage-application';
import {
  CAPTURED_AT,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
} from '#tests/support/coverage-snapshots';
import { inMemoryArtifacts } from '#tests/support/coverage-stand-ins';
import { FixedClock } from '#tests/support/fixed-clock';
import {
  createProjectFolder,
  lockfileOf,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { recordingQueue } from '#tests/support/recording-queue';
import {
  COVERAGE_TEST_SETTINGS,
  RecordingSandbox,
} from '#tests/support/recording-sandbox';
import { SchemaRows } from '#tests/support/schema-rows';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import { standInRepositories } from '#tests/support/stand-in-repositories';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

/** One function on line 1, called by the tests once. */
const SUM = 'export const sum = (a: number, b: number): number => a + b;\n';

const START = { line: 1, column: 0 };

function reportOf(root: string): string {
  const span = { start: START, end: { line: 1, column: 60 } };
  return JSON.stringify({
    [join(root, 'src/sum.ts')]: {
      path: join(root, 'src/sum.ts'),
      statementMap: { '0': span, '1': span },
      fnMap: { '0': { name: '(anonymous_0)', decl: span, loc: span } },
      branchMap: {},
      s: { '0': 1, '1': 1 },
      f: { '0': 1 },
      b: {},
    },
  });
}

/** A sandbox that writes the report Jest would write, after each command. */
function jestSandbox(folder: ProjectFolder): RecordingSandbox {
  return new RecordingSandbox().onRun(() => {
    mkdirSync(join(folder.root, REPORT_FOLDER), { recursive: true });
    writeFileSync(
      join(folder.root, REPORT_FOLDER, 'coverage-final.json'),
      reportOf(folder.root),
    );
  });
}

/** What the service gives the module. */
function servicesOf(database: TemporaryDatabase, folder: ProjectFolder) {
  return [
    { provide: SQLITE_CONNECTION, useValue: database.connection },
    { provide: TRANSACTION_MANAGER, useClass: SqliteTransactionRunner },
    { provide: SANDBOX, useValue: jestSandbox(folder) },
    { provide: ARTIFACT_STORE, useValue: inMemoryArtifacts() },
    { provide: JOB_QUEUE, useValue: recordingQueue() },
    { provide: CLOCK, useValue: new FixedClock(CAPTURED_AT) },
    { provide: ID_GENERATOR, useValue: new SequentialIdGenerator() },
    {
      provide: REPOSITORIES_PUBLIC_API,
      useValue: standInRepositories(folder.root),
    },
    { provide: COVERAGE_SETTINGS, useValue: COVERAGE_TEST_SETTINGS },
  ] satisfies Provider[];
}

async function compile(providers: Provider[]): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [{ module: CoverageModule, providers }],
  }).compile();
}

let database: TemporaryDatabase;
let folder: ProjectFolder;
let services: Provider[];

beforeEach(() => {
  database = createMigratedDatabase();
  new SchemaRows(database.connection).repository({ id: REPOSITORY_ID });
  folder = createProjectFolder({
    'package.json': JSON.stringify({
      name: 'widgets',
      devDependencies: { jest: '^30.5.2' },
    }),
    'package-lock.json': lockfileOf({ jest: '30.5.2' }),
    'src/sum.ts': SUM,
  });
  services = servicesOf(database, folder);
});

afterEach(() => {
  database.remove();
  folder.remove();
});

describe('CoverageModule', () => {
  it('should answer its contract with every part wired', async () => {
    const module = await compile(services);
    const api = module.get<CoveragePublicApi>(COVERAGE_PUBLIC_API);

    const captured = await api.captureSnapshot(
      {
        repositoryId: RepositoryId.create(REPOSITORY_ID),
        commit: CommitSha.create(SNAPSHOT_COMMIT),
        originKey: 'scan:job-1',
      },
      new AbortController().signal,
    );
    const found = await api.getSnapshot({ snapshotId: FIRST_ID });

    expect(api).toBeInstanceOf(CoverageApi);
    expect(captured).toMatchObject({ outcome: 'captured' });
    expect(found).toMatchObject({
      id: FIRST_ID,
      totals: { lines: { covered: 1, total: 1 } },
      files: { below: 0, above: 1, unmeasured: 0, noCode: 0 },
    });
  });

  it('should give the queue its handler of scans', async () => {
    const module = await compile(services);

    expect(module.get(RunScanHandler).kind).toBe('scan');
  });

  it('should give the routes of scans and snapshots their handlers', async () => {
    const module = await compile(services);

    await expect(
      module.get(GetScanHandler).execute({ scanId: 'job-1' }),
    ).resolves.toBeNull();
    await expect(
      module.get(CancelScanHandler).execute({ scanId: 'job-1' }),
    ).resolves.toBeNull();
    await expect(
      module.get(ListSnapshotsHandler).execute({ repositoryId: REPOSITORY_ID }),
    ).resolves.toEqual([]);
  });

  it('should run Jest and Vitest through the sandbox', async () => {
    const module = await compile(services);

    const runners = module.get<readonly TestRunner[]>(TEST_RUNNERS);

    expect(runners.map((runner) => runner.testRunner)).toEqual([
      'jest',
      'vitest',
    ]);
    await expect(module.init()).resolves.toBe(module);
  });

  describe('when no adapter runs a runner the detector can name', () => {
    it('should refuse to start', async () => {
      const module = await compile(services);
      const jestOnly = module
        .get<readonly TestRunner[]>(TEST_RUNNERS)
        .filter((runner) => runner.testRunner === 'jest');

      expect(() => {
        new CoverageModule(jestOnly).onModuleInit();
      }).toThrow(
        new TestRunnerUnavailableError(
          'No adapter runs vitest, which the detector can name.',
        ),
      );
    });
  });
});
