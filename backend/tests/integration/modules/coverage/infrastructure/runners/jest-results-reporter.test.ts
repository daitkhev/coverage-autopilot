import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testReportSchema } from '#coverage/infrastructure/reports/test-report.schema';
import {
  JEST_REPORTER_FILE,
  JEST_REPORTER_SOURCE,
} from '#coverage/infrastructure/runners/jest-results-reporter';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

const RESULTS_FILE = 'node_modules/.coverage-autopilot-test-results.json';

/** A reporter of Jest, as far as a test calls it. */
type Reporter = new () => {
  onRunComplete(contexts: unknown, results: unknown): void;
};

let folder: ProjectFolder;

/** The reporter in a copy, loaded as Jest loads it. */
function reporterInCopy(): Reporter {
  folder.write(JEST_REPORTER_FILE, JEST_REPORTER_SOURCE);
  const path = join(folder.root, JEST_REPORTER_FILE);
  return createRequire(import.meta.url)(path) as Reporter;
}

function writtenReport(): unknown {
  const text = readFileSync(join(folder.root, RESULTS_FILE), 'utf8');
  return testReportSchema.parse(JSON.parse(text));
}

/** A thrown value that holds itself, as a failed request of a client does. */
function circle(): Record<string, unknown> {
  const thrown: Record<string, unknown> = { message: 'no network' };
  thrown['request'] = { agent: thrown };
  return thrown;
}

/** A file of tests as Jest hands it to a reporter: one test of two failed. */
const FAILING_FILE = {
  testFilePath: '/copy/tests/calls.test.ts',
  numFailingTests: 1,
  failureMessage: 'calls > should answer',
  testResults: [
    {
      fullName: 'calls should answer',
      status: 'failed',
      failureMessages: ['Error: no network'],
      failureDetails: [circle()],
    },
    {
      fullName: 'calls should sign',
      status: 'passed',
      failureMessages: [],
      failureDetails: [],
    },
  ],
};

/** A file that failed to run, so it lists no test. */
const BROKEN_FILE = {
  testFilePath: '/copy/tests/broken.test.ts',
  numFailingTests: 0,
  failureMessage: null,
  testExecError: { message: 'Cannot find module' },
  testResults: [],
};

const PASSING_FILE = {
  testFilePath: '/copy/tests/signs.test.ts',
  numFailingTests: 0,
  failureMessage: null,
  testResults: [{ fullName: 'signs', status: 'passed', failureMessages: [] }],
};

beforeEach(() => {
  folder = createProjectFolder();
});

afterEach(() => {
  folder.remove();
});

describe('JEST_REPORTER_SOURCE', () => {
  it('should write the report of a failure that holds a circle', () => {
    const Written = reporterInCopy();

    new Written().onRunComplete(new Set(), { testResults: [FAILING_FILE] });

    expect(writtenReport()).toEqual({
      testResults: [
        {
          name: '/copy/tests/calls.test.ts',
          status: 'failed',
          message: 'calls > should answer',
          assertionResults: [
            {
              fullName: 'calls should answer',
              status: 'failed',
              failureMessages: ['Error: no network'],
            },
            {
              fullName: 'calls should sign',
              status: 'passed',
              failureMessages: [],
            },
          ],
        },
      ],
    });
  });

  it('should say why a file failed to run, and that another passed', () => {
    const Written = reporterInCopy();

    new Written().onRunComplete(new Set(), {
      testResults: [BROKEN_FILE, PASSING_FILE],
    });

    expect(writtenReport()).toMatchObject({
      testResults: [
        { status: 'failed', message: 'Cannot find module' },
        { status: 'passed', message: '' },
      ],
    });
  });
});
