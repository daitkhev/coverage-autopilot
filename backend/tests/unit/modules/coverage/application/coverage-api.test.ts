import { describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  coverageApiOf,
  coverageApplication,
  FIRST_ID,
} from '#tests/support/coverage-application';
import {
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
} from '#tests/support/coverage-snapshots';
import { PASSED } from '#tests/support/recording-sandbox';
import { loanOf } from '#tests/support/stand-in-repositories';

const LOAN = loanOf('improvement:1');

const RUNNING = new AbortController().signal;

describe('CoverageApi', () => {
  it('should capture a snapshot and then find it and its files', async () => {
    const api = coverageApiOf(coverageApplication());

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

  describe('prepareProject', () => {
    it('should describe the project it prepared', async () => {
      const api = coverageApiOf(coverageApplication());

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

        const prepared = await coverageApiOf(application).prepareProject(
          LOAN,
          RUNNING,
        );

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

      const result = await coverageApiOf(application).runTests(
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
