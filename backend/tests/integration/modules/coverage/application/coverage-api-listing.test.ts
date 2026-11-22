import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CoverageApi } from '#coverage/application/coverage-api';
import { NodeProjectDetector } from '#coverage/infrastructure/detection/node-project-detector.adapter';
import type { StartImprovementResult } from '#improvement/application/commands/start-improvement/start-improvement.command';
import { StartImprovementHandler } from '#improvement/application/commands/start-improvement/start-improvement.handler';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  coverageApiOf,
  type CoverageApplication,
  coverageApplication,
  FIRST_ID,
  reportRowOf,
} from '#tests/support/coverage-application';
import {
  measuredFile,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
} from '#tests/support/coverage-snapshots';
import { startCommandOf } from '#tests/support/improvement-request-stand-ins';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { TEST_SETTINGS } from '#tests/support/improvement-values';
import {
  createProjectFolder,
  lockfileOf,
  type ProjectFolder,
} from '#tests/support/project-folder';

const SOURCE = 'export const one = 1;\n';

const PRODUCT = 'src/price.ts';

const EXAMPLE = 'examples/use-price.ts';

const NO_SOURCE = 'src/price.js';

const RUNNING = new AbortController().signal;

let folder: ProjectFolder;
let application: CoverageApplication;
let api: CoverageApi;

/**
 * A Jest project with an example beside its source, listed by the
 * detector, and a report of the runner that counts both files.
 */
beforeEach(async () => {
  folder = createProjectFolder({
    'package.json': JSON.stringify({
      name: 'gadgets',
      devDependencies: { jest: '^30.5.2' },
    }),
    'package-lock.json': lockfileOf({ jest: '30.5.2' }),
    [PRODUCT]: SOURCE,
    [NO_SOURCE]: SOURCE,
    [EXAMPLE]: SOURCE,
  });
  application = coverageApplication();
  application.detector.detection = await new NodeProjectDetector().detect(
    folder.root,
  );
  application.reader.report = new Map([
    reportRowOf(measuredFile(PRODUCT, { statements: [3, 6], lines: [2, 5] })),
    reportRowOf(measuredFile(EXAMPLE, { statements: [0, 7], lines: [0, 7] })),
  ]);
  api = coverageApiOf(application);
  await api.captureSnapshot(
    {
      repositoryId: RepositoryId.create(REPOSITORY_ID),
      commit: CommitSha.create(SNAPSHOT_COMMIT),
      originKey: 'scan:1',
    },
    RUNNING,
  );
});

afterEach(() => {
  folder.remove();
});

describe('a snapshot of a project with an examples folder', () => {
  it('should ask the runner to measure the product alone', () => {
    expect(application.runner.requests[0]?.coverageFiles).toEqual([
      FilePath.create(PRODUCT),
    ]);
  });

  it('should count the product alone in its split and its totals', async () => {
    const snapshot = await api.getSnapshot({ snapshotId: FIRST_ID });

    expect(snapshot).toMatchObject({
      parameters: { fileListRule: 'typescript-sources-v2' },
      totals: {
        statements: { covered: 3, total: 6 },
        lines: { covered: 2, total: 5 },
      },
      files: { below: 1, above: 0, unmeasured: 0, noCode: 0 },
    });
  });

  describe('when an improvement of an example is asked', () => {
    const startOf = async (
      filePath: string,
    ): Promise<StartImprovementResult> => {
      const world = new ImprovementRequestWorld();
      const start = new StartImprovementHandler(
        api,
        world.repositories,
        world.hasher,
        world.registration,
        world.views,
        TEST_SETTINGS,
      );
      return start.execute(
        startCommandOf({ snapshotId: FIRST_ID, filePath }),
        RUNNING,
      );
    };

    it('should refuse it as it refuses a file that is no source', async () => {
      const example = await startOf(EXAMPLE);
      const noSource = await startOf(NO_SOURCE);
      const product = await startOf(PRODUCT);

      expect(example).toEqual({
        outcome: 'refused',
        reason: 'target_not_measured',
        message: `${EXAMPLE} is not a measured file of the snapshot ${FIRST_ID}.`,
      });
      expect(noSource).toMatchObject({
        outcome: 'refused',
        reason: 'target_not_measured',
      });
      expect(product.outcome).toBe('created');
    });
  });
});
