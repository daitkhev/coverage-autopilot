import { basename } from 'node:path';

import { RESULTS_FILE } from '#coverage/infrastructure/runners/sandboxed-test-runner.adapter';

/**
 * Where the reporter is written, relative to the working copy: beside the
 * report it writes, which it finds by its own folder, since a reporter
 * named on the command line takes no option.
 */
export const JEST_REPORTER_FILE =
  'node_modules/.coverage-autopilot-test-reporter.cjs';

/**
 * A reporter of Jest that writes the report of the tests in the shape of
 * `--json`, with only what the service reads: the names, the states and
 * the messages. `--json` itself writes every thrown value whole, and ends
 * with no report at all when one holds a circle, as the failed request of
 * an HTTP client does.
 */
export const JEST_REPORTER_SOURCE = `'use strict';
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const RESULTS = join(__dirname, ${JSON.stringify(basename(RESULTS_FILE))});

function statusOf(file) {
  return file.testExecError || file.numFailingTests > 0 ? 'failed' : 'passed';
}

function messageOf(file) {
  if (typeof file.failureMessage === 'string') {
    return file.failureMessage;
  }
  return file.testExecError ? String(file.testExecError.message) : '';
}

function testOf(test) {
  return {
    fullName: test.fullName,
    status: test.status,
    failureMessages: test.failureMessages,
  };
}

module.exports = class {
  onRunComplete(contexts, results) {
    const testResults = results.testResults.map((file) => ({
      name: file.testFilePath,
      status: statusOf(file),
      message: messageOf(file),
      assertionResults: file.testResults.map(testOf),
    }));
    writeFileSync(RESULTS, JSON.stringify({ testResults }));
  }
};
`;
