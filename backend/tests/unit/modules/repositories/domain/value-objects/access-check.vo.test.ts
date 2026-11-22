import { describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { Instant } from '#kernel/time/instant';
import { InvalidAccessCheckError } from '#repositories/domain/errors/invalid-access-check.error';
import {
  AccessCheck,
  type AccessStepOutcome,
} from '#repositories/domain/value-objects/access-check.vo';

const CHECKED_AT = Instant.parse('2026-01-02T03:04:05.006Z');
const HEAD = CommitSha.create('b'.repeat(40));

const PASSED: AccessStepOutcome = { status: 'passed', message: 'Found.' };
const FAILED: AccessStepOutcome = {
  status: 'failed',
  message: 'Refused.',
  toolOutput: 'You are not logged in.',
};
const LAST_PASSED: AccessStepOutcome = {
  status: 'passed',
  message: 'Allowed.',
  headCommit: HEAD,
  destination: { route: 'fork', account: 'acme-bot' },
};

function checkOf(...outcomes: AccessStepOutcome[]): AccessCheck {
  return outcomes.reduce(
    (check, outcome) => check.record(outcome),
    AccessCheck.begin(CHECKED_AT),
  );
}

describe('AccessCheck', () => {
  describe('begin', () => {
    it('should start with the first step and nothing run', () => {
      const check = AccessCheck.begin(CHECKED_AT);

      expect(check.checkedAt).toBe(CHECKED_AT);
      expect(check.nextStep()).toBe('git_present');
      expect(check.passed).toBe(false);
      expect(check.headCommit).toBeNull();
      expect(check.destination).toBeNull();
      expect(check.steps.map((step) => step.status)).toEqual([
        'not_run',
        'not_run',
        'not_run',
      ]);
    });
  });

  describe('record', () => {
    it('should run the steps in their order', () => {
      const check = checkOf(PASSED);

      expect(check.nextStep()).toBe('gh_authenticated');
      expect(checkOf(PASSED, PASSED).nextStep()).toBe('push_allowed');
    });

    it('should pass with the head and the destination of the last step when every step passed', () => {
      const check = checkOf(PASSED, PASSED, LAST_PASSED);

      expect(check.passed).toBe(true);
      expect(check.headCommit).toBe(HEAD);
      expect(check.destination).toEqual({ route: 'fork', account: 'acme-bot' });
      expect(check.nextStep()).toBeNull();
      expect(check.steps).toEqual([
        {
          name: 'git_present',
          status: 'passed',
          message: 'Found.',
          toolOutput: null,
        },
        {
          name: 'gh_authenticated',
          status: 'passed',
          message: 'Found.',
          toolOutput: null,
        },
        {
          name: 'push_allowed',
          status: 'passed',
          message: 'Allowed.',
          toolOutput: null,
        },
      ]);
    });

    it('should leave the check it was called on as it was', () => {
      const check = AccessCheck.begin(CHECKED_AT);

      check.record(PASSED);

      expect(check.nextStep()).toBe('git_present');
    });

    describe('when a step fails', () => {
      it('should stop the check and leave the rest not run', () => {
        const check = checkOf(PASSED, FAILED);

        expect(check.nextStep()).toBeNull();
        expect(check.passed).toBe(false);
        expect(check.headCommit).toBeNull();
        expect(check.destination).toBeNull();
        expect(check.steps).toEqual([
          {
            name: 'git_present',
            status: 'passed',
            message: 'Found.',
            toolOutput: null,
          },
          {
            name: 'gh_authenticated',
            status: 'failed',
            message: 'Refused.',
            toolOutput: 'You are not logged in.',
          },
          {
            name: 'push_allowed',
            status: 'not_run',
            message: null,
            toolOutput: null,
          },
        ]);
      });

      it('should throw InvalidAccessCheckError for another step', () => {
        expect(() => checkOf(FAILED).record(PASSED)).toThrow(
          InvalidAccessCheckError,
        );
      });
    });

    describe('when every step ran', () => {
      it('should throw InvalidAccessCheckError for one more', () => {
        expect(() =>
          checkOf(PASSED, PASSED, LAST_PASSED).record(PASSED),
        ).toThrow(InvalidAccessCheckError);
      });
    });

    describe('when the head comes at the wrong step', () => {
      it('should throw InvalidAccessCheckError for a head before the last step', () => {
        expect(() => checkOf(LAST_PASSED)).toThrow(InvalidAccessCheckError);
      });

      it('should throw InvalidAccessCheckError for a last step with no head', () => {
        expect(() => checkOf(PASSED, PASSED, PASSED)).toThrow(
          InvalidAccessCheckError,
        );
      });

      it('should throw InvalidAccessCheckError for a destination before the last step', () => {
        expect(() =>
          checkOf({ ...PASSED, destination: { route: 'repository' } }),
        ).toThrow(InvalidAccessCheckError);
      });

      it.each([
        ['no destination', { ...PASSED, headCommit: HEAD }],
        ['no head', { ...PASSED, destination: { route: 'repository' } }],
      ] as const)(
        'should throw InvalidAccessCheckError for a last step with %s',
        (_name, last) => {
          expect(() => checkOf(PASSED, PASSED, last)).toThrow(
            InvalidAccessCheckError,
          );
        },
      );
    });
  });

  describe('InvalidAccessCheckError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidAccessCheckError('x')).toMatchObject({
        name: 'InvalidAccessCheckError',
        code: 'invalid_access_check',
        retryable: false,
      });
    });
  });
});
