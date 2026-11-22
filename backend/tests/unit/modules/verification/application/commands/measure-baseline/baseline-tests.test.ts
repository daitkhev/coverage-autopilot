import { describe, expect, it } from 'vitest';

import type {
  FailingTestDto,
  TestRunDto,
} from '#coverage/application/contracts/coverage-public-api';
import { FilePath } from '#kernel/primitives/file-path';
import { FAILING_TESTS } from '#tests/support/verification-coverage';
import { baselineTestsOf } from '#verification/application/commands/measure-baseline/baseline-tests';

const RAN = 53;

function runOf(spec: Partial<TestRunDto>): TestRunDto {
  return {
    status: 'failed',
    exitCode: 1,
    durationMs: 900,
    outputReference: 'test-run',
    firstFailure: null,
    outcomes: null,
    ...spec,
  };
}

function failingRun(failing: readonly FailingTestDto[]): TestRunDto {
  return runOf({ outcomes: { ran: RAN, failing } });
}

function failingIn(file: string, test: string | null): FailingTestDto {
  return { file: FilePath.create(file), test };
}

describe('baselineTestsOf', () => {
  describe('when the tests passed', () => {
    it('should keep that no test failed, under either rule', () => {
      const run = runOf({ status: 'passed', exitCode: 0 });

      expect([
        baselineTestsOf(run, 'may_fail'),
        baselineTestsOf(run, 'must_pass'),
      ]).toEqual([
        {
          outcome: 'read',
          tests: { existingTests: 'passed', failingTests: [] },
        },
        {
          outcome: 'read',
          tests: { existingTests: 'passed', failingTests: [] },
        },
      ]);
    });
  });

  describe('when the tests timed out', () => {
    it('should keep that the failing tests are not known', () => {
      const run = runOf({ status: 'timed_out', exitCode: null });

      expect(baselineTestsOf(run, 'must_pass')).toEqual({
        outcome: 'read',
        tests: { existingTests: 'timed_out', failingTests: null },
      });
    });
  });

  describe('when tests failed and the rule lets them', () => {
    it('should keep each test that failed, to be left out', () => {
      const reading = baselineTestsOf(failingRun(FAILING_TESTS), 'may_fail');

      expect(reading).toEqual({
        outcome: 'read',
        tests: { existingTests: 'failed', failingTests: FAILING_TESTS },
      });
    });
  });

  describe('when tests failed and the rule says they must pass', () => {
    it('should refuse the commit, with how many failed and the first by name', () => {
      const failing = [
        failingIn('tests/feed.test.ts', 'feed > reads the feed'),
        failingIn('tests/api.test.ts', 'api > lists the items'),
        failingIn('tests/api.test.ts', 'api > answers 404'),
      ];

      expect(baselineTestsOf(failingRun(failing), 'must_pass')).toEqual({
        outcome: 'refused',
        detail:
          '3 of 53 tests of the repository fail in the sandbox. The first ' +
          'is "api > answers 404" in tests/api.test.ts.',
        outputReference: 'test-run',
      });
    });

    it('should name a file that failed to run before the tests of the file', () => {
      const failing = [
        failingIn('tests/clock.test.ts', 'clock > ticks'),
        failingIn('tests/clock.test.ts', null),
      ];

      expect(baselineTestsOf(failingRun(failing), 'must_pass')).toMatchObject({
        detail:
          '2 of 53 tests of the repository fail in the sandbox. The first ' +
          'is tests/clock.test.ts, which failed to run.',
      });
    });

    it('should say a single test in the singular', () => {
      const run = runOf({
        outcomes: { ran: 1, failing: [failingIn('tests/one.test.ts', 'one')] },
      });

      expect(baselineTestsOf(run, 'must_pass')).toMatchObject({
        detail:
          '1 of 1 test of the repository fails in the sandbox. The first ' +
          'is "one" in tests/one.test.ts.',
      });
    });

    it('should cut a long name to what a person can read', () => {
      const name = 'x'.repeat(250);

      const reading = baselineTestsOf(
        failingRun([failingIn('tests/long.test.ts', name)]),
        'must_pass',
      );

      expect(reading).toMatchObject({
        detail: `1 of 53 tests of the repository fails in the sandbox. The first is "${'x'.repeat(200)}…" in tests/long.test.ts.`,
      });
    });

    it('should keep a run that failed with no test that failed, such as one that found none', () => {
      const reading = baselineTestsOf(failingRun([]), 'must_pass');

      expect(reading).toEqual({
        outcome: 'read',
        tests: { existingTests: 'failed', failingTests: [] },
      });
    });
  });

  describe('when tests failed and no report named them', () => {
    it.each([
      [1, 'exit code 1'],
      [null, 'no exit code'],
    ])(
      'should refuse the commit, under either rule, for an exit of %s',
      (exitCode, ending) => {
        const run = runOf({ exitCode, outputReference: null });

        expect(baselineTestsOf(run, 'may_fail')).toEqual({
          outcome: 'refused',
          detail:
            'The tests of the repository fail in the sandbox: their runner ' +
            `ended with ${ending} and wrote no report that names the tests ` +
            'that failed.',
          outputReference: null,
        });
      },
    );
  });
});
