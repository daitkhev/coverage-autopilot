import { describe, expect, it } from 'vitest';

import { CaptureSnapshotHandler } from '#coverage/application/commands/capture-snapshot/capture-snapshot.handler';
import { RunTestsHandler } from '#coverage/application/commands/run-tests/run-tests.handler';
import { CoverageApi } from '#coverage/application/coverage-api';
import { GetFileCoverageHandler } from '#coverage/application/queries/get-file-coverage/get-file-coverage.handler';
import { GetSnapshotHandler } from '#coverage/application/queries/get-snapshot/get-snapshot.handler';
import { ListSnapshotFilesHandler } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.handler';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  type CoverageApplication,
  coverageApplication,
  FIRST_ID,
} from '#tests/support/coverage-application';
import {
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
} from '#tests/support/coverage-snapshots';
import {
  COVERAGE_TEST_SETTINGS,
  PASSED,
} from '#tests/support/recording-sandbox';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';

const settings = COVERAGE_TEST_SETTINGS;

function apiOf(application: CoverageApplication): CoverageApi {
  const { snapshots, capture, transactions, detector, tests } = application;
  return new CoverageApi(
    new CaptureSnapshotHandler(snapshots, capture, transactions, settings),
    application.preparation,
    new RunTestsHandler(detector, tests, settings),
    new GetSnapshotHandler(snapshots, settings),
    new GetFileCoverageHandler(snapshots, settings),
    new ListSnapshotFilesHandler(snapshots, settings),
  );
}

const LOAN = { workingCopyPath: WORKING_COPY_PATH, owner: 'improvement:1' };

const RUNNING = new AbortController().signal;

describe('CoverageApi', () => {
  it('should capture a snapshot and then find it and its files', async () => {
    const api = apiOf(coverageApplication());

    const captured = await api.captureSnapshot(
      {
        repositoryId: RepositoryId.create(REPOSITORY_ID),
        commit: CommitSha.create(SNAPSHOT_COMMIT),
        originKey: 'improvement:1:baseline',
      },
      RUNNING,
    );
    const found = await api.getSnapshot({ snapshotId: FIRST_ID });
    const file = await api.getFileCoverage({
      snapshotId: FIRST_ID,
      path: FilePath.create('src/types.ts'),
    });

    expect(captured).toMatchObject({ snapshot: { id: FIRST_ID } });
    expect(found).toMatchObject({ id: FIRST_ID });
    expect(file).toMatchObject({ state: 'no_executable_code' });
  });

  it('should list the files of a snapshot as a request narrows them', async () => {
    const api = apiOf(coverageApplication());
    await api.captureSnapshot(
      {
        repositoryId: RepositoryId.create(REPOSITORY_ID),
        commit: CommitSha.create(SNAPSHOT_COMMIT),
        originKey: 'improvement:1:baseline',
      },
      RUNNING,
    );

    const listed = await api.listSnapshotFiles({
      snapshotId: FIRST_ID,
      state: 'no_executable_code',
    });

    expect(listed?.files).toEqual([
      { path: FilePath.create('src/types.ts'), state: 'no_executable_code' },
    ]);
  });

  describe('prepareProject', () => {
    it('should describe the project it prepared', async () => {
      const api = apiOf(coverageApplication());

      const prepared = await api.prepareProject(LOAN, RUNNING);

      expect(prepared).toEqual({
        outcome: 'ready',
        project: {
          testRunner: 'jest',
          testRunnerVersion: '30.5.2',
          packageManager: 'npm',
          configFile: FilePath.create('jest.config.json'),
        },
        parameters: {
          testRunner: 'jest',
          testRunnerVersion: '30.5.2',
          coverageProvider: 'babel',
          fileListRule: 'default-sources-v1',
        },
      });
    });

    describe('when the install fails', () => {
      it('should answer the failure as it is', async () => {
        const application = coverageApplication();
        application.sandbox.answer({ ...PASSED, exitCode: 1 });

        const prepared = await apiOf(application).prepareProject(LOAN, RUNNING);

        expect(prepared).toEqual({
          outcome: 'install_failed',
          exitCode: 1,
          outputReference: 'artifact-1',
        });
      });
    });
  });

  describe('runTests', () => {
    it('should run the tests in the working copy it is lent', async () => {
      const application = coverageApplication();

      const result = await apiOf(application).runTests(
        { ...LOAN, testFiles: [], withCoverage: false },
        RUNNING,
      );

      expect(result).toMatchObject({
        outcome: 'completed',
        testRun: { status: 'passed' },
      });
      expect(application.runner.requests).toHaveLength(1);
    });
  });
});
