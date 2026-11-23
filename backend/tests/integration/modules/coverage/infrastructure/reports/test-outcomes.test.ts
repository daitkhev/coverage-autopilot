import { describe, expect, it } from 'vitest';

import { testOutcomesOf } from '#coverage/infrastructure/reports/test-outcomes';
import type {
  TestFileResult,
  TestReport,
} from '#coverage/infrastructure/reports/test-report.schema';
import { FilePath } from '#kernel/primitives/file-path';

/*
 * Reports in the shape Jest 30 and Vitest 4 wrote for a small project
 * with one test that calls the network, one file that does not load and
 * one test that is skipped. Both runners name files by absolute paths.
 */

const ROOT = '/work/acme-gadgets';
const ROOTS = [ROOT];

function fileOf(name: string, spec: Partial<TestFileResult>): TestFileResult {
  return {
    name: `${ROOT}/${name}`,
    status: 'passed',
    message: '',
    assertionResults: [],
    ...spec,
  };
}

function testOf(fullName: string, status: string) {
  return { fullName, status, failureMessages: [] };
}

function reportOf(...files: TestFileResult[]): TestReport {
  return { testResults: files };
}

const PASSING_FILE = fileOf('tests/price.test.ts', {
  assertionResults: [
    testOf('price rounds', 'passed'),
    testOf('price adds tax', 'passed'),
    testOf('price in another currency', 'skipped'),
    testOf('price someday', 'todo'),
  ],
});

const NETWORK_FILE = fileOf('tests/rates.test.ts', {
  status: 'failed',
  assertionResults: [
    testOf('rates reads a table', 'passed'),
    testOf('rates fetches the latest', 'failed'),
  ],
});

const UNLOADED_FILE = fileOf('tests/client.test.ts', {
  status: 'failed',
  message: "Cannot find module './token' imported from ./tests/client.ts",
});

const NETWORK_TEST = {
  file: FilePath.create('tests/rates.test.ts'),
  test: 'rates fetches the latest',
};

describe('testOutcomesOf', () => {
  describe('when every test passed', () => {
    it('should count the tests that ran and name no failure', () => {
      expect(testOutcomesOf(reportOf(PASSING_FILE), ROOTS)).toEqual({
        ran: 2,
        failing: [],
      });
    });
  });

  describe('when tests fail', () => {
    it('should name each failing test by its file and its full name', () => {
      const report = reportOf(PASSING_FILE, NETWORK_FILE);

      expect(testOutcomesOf(report, ROOTS)).toEqual({
        ran: 4,
        failing: [NETWORK_TEST],
      });
    });

    it('should count a file that failed to run as one test with no name', () => {
      const report = reportOf(UNLOADED_FILE, NETWORK_FILE);

      expect(testOutcomesOf(report, ROOTS)).toEqual({
        ran: 3,
        failing: [
          { file: FilePath.create('tests/client.test.ts'), test: null },
          NETWORK_TEST,
        ],
      });
    });

    it('should name a test once when the report lists it twice', () => {
      const twice = fileOf('tests/rates.test.ts', {
        status: 'failed',
        assertionResults: [
          testOf('rates fetches the latest', 'failed'),
          testOf('rates fetches the latest', 'failed'),
        ],
      });

      expect(testOutcomesOf(reportOf(twice), ROOTS)?.failing).toEqual([
        NETWORK_TEST,
      ]);
    });
  });

  describe('when a name holds what two copies say apart', () => {
    it('should name the test as any copy of the commit does', () => {
      const coloured = fileOf('tests/paths.test.ts', {
        status: 'failed',
        assertionResults: [
          testOf(`paths \u001b[1mreads\u001b[22m ${ROOT}/data\n now`, 'failed'),
        ],
      });

      expect(testOutcomesOf(reportOf(coloured), ROOTS)?.failing).toEqual([
        {
          file: FilePath.create('tests/paths.test.ts'),
          test: 'paths reads ./data now',
        },
      ]);
    });
  });

  describe('when a failing test is in no file of the copy', () => {
    it('should give nothing, since the test cannot be named', () => {
      const outside = {
        ...NETWORK_FILE,
        name: '/elsewhere/tests/rates.test.ts',
      };

      expect(testOutcomesOf(reportOf(PASSING_FILE, outside), ROOTS)).toBeNull();
    });

    it('should still count a passing file outside the copy', () => {
      const outside = { ...PASSING_FILE, name: '/elsewhere/price.test.ts' };

      expect(testOutcomesOf(reportOf(outside), ROOTS)).toEqual({
        ran: 2,
        failing: [],
      });
    });
  });

  describe('when the report lists no test', () => {
    it('should count none', () => {
      expect(testOutcomesOf(reportOf(), ROOTS)).toEqual({
        ran: 0,
        failing: [],
      });
    });
  });
});
