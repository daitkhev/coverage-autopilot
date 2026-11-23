import { describe, expect, it } from 'vitest';

import {
  budgetExhausted,
  type Change,
  failedWith,
  faultOfStep,
  retriesExhausted,
  unreadablePayload,
} from '#improvement/application/commands/run-improvement/run-failures';
import { ScriptedStep } from '#tests/support/improvement-handler-step';
import { improvementIn } from '#tests/support/improvement-journeys';
import { minutesIn } from '#tests/support/improvement-values';

const AT = minutesIn(11);

/** The failure an improvement at work ends with, after the change. */
function failureAfter(change: Change): unknown {
  const improvement = improvementIn('verifying');
  change(improvement, AT);
  const { status, failure, phaseStartedAt } = improvement;
  return {
    status,
    at: phaseStartedAt,
    reason: failure?.reason,
    message: failure?.message,
  };
}

describe('the failures of a run', () => {
  it('should fail the improvement at the moment the run gives', () => {
    expect(
      failureAfter(failedWith('publish_failed', 'The push was refused.')),
    ).toEqual({
      status: 'failed',
      at: AT,
      reason: 'publish_failed',
      message: 'The push was refused.',
    });
  });

  it('should name the minutes of the budget that are spent', () => {
    expect(failureAfter(budgetExhausted(improvementIn('verifying')))).toEqual({
      status: 'failed',
      at: AT,
      reason: 'budget_exhausted',
      message:
        'The deadline passed: the 30 minutes of work of the budget are spent.',
    });
  });

  it('should name the version of a payload it cannot run', () => {
    expect(failureAfter(unreadablePayload(2))).toMatchObject({
      reason: 'retries_exhausted',
      message:
        'The job has the payload version 2, which another version of the ' +
        'service wrote and this one cannot run.',
    });
  });

  it('should say that every run of the job ended in a fault', () => {
    expect(failureAfter(retriesExhausted())).toMatchObject({
      reason: 'retries_exhausted',
      message:
        'Every run of its job that the queue allows ended in a fault, so the ' +
        'work was given up.',
    });
  });

  describe('faultOfStep', () => {
    const step = new ScriptedStep('generating', 'generator_unavailable');

    it('should fail with the reason of the step, the code and the message', () => {
      const fault = { code: 'tool_unavailable', message: 'No CLI.' };

      expect(failureAfter(faultOfStep(step, fault))).toMatchObject({
        reason: 'generator_unavailable',
        message:
          'The work of generating stopped on the fault tool_unavailable: No ' +
          'CLI.',
      });
    });

    it('should leave out a message too long for a sentence', () => {
      const fault = { code: 'tool_unavailable', message: 'x'.repeat(10_000) };

      expect(failureAfter(faultOfStep(step, fault))).toMatchObject({
        message:
          'The work of generating stopped on the fault tool_unavailable: ' +
          'its message was too long to keep.',
      });
    });
  });
});
