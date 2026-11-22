import { describe, expect, it } from 'vitest';

import {
  refusalOf,
  testsStepOf,
} from '#verification/application/commands/measure-baseline/measurement-step';

describe('refusalOf', () => {
  it('should answer an unsupported project with its reason', () => {
    const step = refusalOf({
      outcome: 'unsupported',
      reason: 'monorepo',
      detail: 'The project is a monorepo.',
    });

    expect(step).toEqual({
      outcome: 'stopped',
      result: {
        outcome: 'unsupported',
        reason: 'project_unsupported',
        detail: 'The project is a monorepo.',
        outputReference: null,
      },
    });
  });

  it('should answer an install that failed with its output', () => {
    const failed = refusalOf({
      outcome: 'install_failed',
      exitCode: 1,
      outputReference: 'install',
    });
    const stopped = refusalOf({
      outcome: 'install_failed',
      exitCode: null,
      outputReference: 'install',
    });

    expect(failed).toEqual({
      outcome: 'stopped',
      result: {
        outcome: 'unsupported',
        reason: 'install_failed',
        detail: 'The install of the packages ended with exit code 1.',
        outputReference: 'install',
      },
    });
    expect(stopped).toMatchObject({
      result: { detail: 'The install of the packages ran out of time.' },
    });
  });
});

describe('testsStepOf', () => {
  it('should give the tests it read', () => {
    const tests = { existingTests: 'passed', failingTests: [] } as const;

    expect(testsStepOf({ outcome: 'read', tests })).toEqual({
      outcome: 'done',
      value: tests,
    });
  });

  it('should stop with existing_tests_fail on tests it refused', () => {
    const step = testsStepOf({
      outcome: 'refused',
      detail: '1 of 2 tests of the repository fail in the sandbox.',
      outputReference: 'test-run',
    });

    expect(step).toEqual({
      outcome: 'stopped',
      result: {
        outcome: 'unsupported',
        reason: 'existing_tests_fail',
        detail: '1 of 2 tests of the repository fail in the sandbox.',
        outputReference: 'test-run',
      },
    });
  });
});
