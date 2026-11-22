import { describe, expect, it } from 'vitest';

import type { RunTestsResult } from '#coverage/application/contracts/coverage-public-api';
import {
  testRunOf,
  UNSUPPORTED_RUN,
} from '#tests/support/verification-coverage';
import {
  hasPassed,
  testRunResultOf,
} from '#verification/application/commands/verify-patch/checks/test-run-result';

function resultOf(run: RunTestsResult): ReturnType<typeof testRunResultOf> {
  return testRunResultOf({
    name: 'new_tests_pass',
    run,
    failed: 'They fail.',
    timedOut: 'They ran out of time.',
    runs: 2,
  });
}

describe('testRunResultOf', () => {
  it('should pass a run in which every test passed', () => {
    const result = resultOf(testRunOf('passed'));

    expect(result.status).toBe('passed');
    expect(result.runs).toBe(2);
    expect(result.outputReference).toBe('test-run-passed');
  });

  it('should fail a run in which a test failed, with its sentence', () => {
    const result = resultOf(testRunOf('failed'));

    expect(result.status).toBe('failed');
    expect(result.message).toBe('They fail.');
  });

  describe('when the run was stopped at its limit', () => {
    it('should be an error worth running again', () => {
      const result = resultOf(testRunOf('timed_out'));

      expect(result.status).toBe('error');
      expect(result.retryable).toBe(true);
      expect(result.message).toBe('They ran out of time.');
    });
  });

  describe('when the runner cannot run the project', () => {
    it('should be an error that running again does not help', () => {
      const result = resultOf(UNSUPPORTED_RUN);

      expect(result.retryable).toBe(false);
      expect(result.message).toBe(
        'The test runner cannot run the project: No test runner is installed.',
      );
    });
  });
});

describe('hasPassed', () => {
  it('should hold only a completed run in which every test passed', () => {
    expect(hasPassed(testRunOf('passed'))).toBe(true);
    expect(hasPassed(testRunOf('failed'))).toBe(false);
    expect(hasPassed(UNSUPPORTED_RUN)).toBe(false);
  });
});
