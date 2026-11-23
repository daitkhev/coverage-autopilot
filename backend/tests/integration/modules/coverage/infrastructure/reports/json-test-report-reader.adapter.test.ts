import { mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonTestReportReader } from '#coverage/infrastructure/reports/json-test-report-reader.adapter';
import { FilePath } from '#kernel/primitives/file-path';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

const REPORT = 'node_modules/results.json';

let folder: ProjectFolder;

beforeEach(() => {
  folder = createProjectFolder();
});

afterEach(() => {
  folder.remove();
});

/** A report of one test file that failed to run, at the path a runner writes. */
function failedToRunAt(root: string): string {
  return JSON.stringify({
    numFailedTestSuites: 1,
    testResults: [
      {
        name: join(root, 'tests/helpers/utils.test.ts'),
        status: 'failed',
        message: `Cannot find module './random' imported from ${root}/src/helpers/utils.ts`,
        assertionResults: [],
        startTime: 0,
      },
    ],
  });
}

async function read(reportPath = join(folder.root, REPORT)) {
  return new JsonTestReportReader().firstFailure({
    workingCopyPath: folder.root,
    reportPath,
  });
}

describe('JsonTestReportReader', () => {
  describe('firstFailure', () => {
    it('should give the first failure with the paths of the copy made relative', async () => {
      folder.write(REPORT, failedToRunAt(realpathSync(folder.root)));

      await expect(read()).resolves.toEqual({
        file: FilePath.create('tests/helpers/utils.test.ts'),
        test: null,
        lines: [
          "Cannot find module './random' imported from ./src/helpers/utils.ts",
        ],
      });
    });

    it('should give nothing when the runner wrote no report', async () => {
      await expect(read()).resolves.toBeNull();
    });

    it.each([
      ['a text that is not JSON', '{"testResults": ['],
      ['JSON of another shape', '{"testResults": [{"name": 7}]}'],
      ['a report with no failure', '{"testResults": []}'],
    ])('should give nothing for %s', async (_case, text) => {
      folder.write(REPORT, text);

      await expect(read()).resolves.toBeNull();
    });

    it('should not follow a link the code of the repository left', async () => {
      const outside = createProjectFolder({
        'results.json': failedToRunAt(realpathSync(folder.root)),
      });
      mkdirSync(join(folder.root, 'node_modules'));
      symlinkSync(
        join(outside.root, 'results.json'),
        join(folder.root, REPORT),
      );

      try {
        await expect(read()).resolves.toBeNull();
      } finally {
        outside.remove();
      }
    });
  });

  describe('outcomes', () => {
    async function outcomes() {
      return new JsonTestReportReader().outcomes({
        workingCopyPath: folder.root,
        reportPath: join(folder.root, REPORT),
      });
    }

    it('should count the tests and name the failing ones in the copy', async () => {
      folder.write(REPORT, failedToRunAt(realpathSync(folder.root)));

      await expect(outcomes()).resolves.toEqual({
        ran: 1,
        failing: [
          { file: FilePath.create('tests/helpers/utils.test.ts'), test: null },
        ],
      });
    });

    it('should give nothing when the runner wrote no report', async () => {
      await expect(outcomes()).resolves.toBeNull();
    });

    it('should give nothing for JSON of another shape', async () => {
      folder.write(REPORT, '{"testResults": [{"name": 7}]}');

      await expect(outcomes()).resolves.toBeNull();
    });
  });
});
