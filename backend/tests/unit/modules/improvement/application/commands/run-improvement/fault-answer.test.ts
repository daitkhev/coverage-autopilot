import { describe, expect, it } from 'vitest';

import {
  answerTo,
  type FaultAnswer,
  type FaultScene,
} from '#improvement/application/commands/run-improvement/fault-answer';
import { RunDeadline } from '#improvement/application/commands/run-improvement/run-deadline';
import { StaleImprovementError } from '#improvement/domain/errors/stale-improvement.error';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import { LeaseLostError } from '#ports/errors/lease-lost.error';
import { FixedClock } from '#tests/support/fixed-clock';
import { ManualAlarm } from '#tests/support/improvement-handler-alarm';
import { ToolFault } from '#tests/support/improvement-handler-fault';
import { ScriptedStep } from '#tests/support/improvement-handler-step';
import { improvementIn } from '#tests/support/improvement-journeys';
import { minutesIn } from '#tests/support/improvement-values';

const PASSING = new ToolFault({ message: 'It may pass.', retryable: true });

const LASTING = new ToolFault({
  message: 'It will not pass.',
  retryable: false,
});

interface SceneSpec {
  readonly step?: ScriptedStep | null;
  readonly job?: AbortController;
  /** The minute the clock stands at. The deadline is at minute 31. */
  readonly minute?: number;
}

function sceneOf(spec: SceneSpec = {}): FaultScene {
  const improvement = improvementIn('analyzing');
  const job = spec.job ?? new AbortController();
  const deadline = new RunDeadline(job.signal, {
    alarm: new ManualAlarm(),
    clock: new FixedClock(minutesIn(spec.minute ?? 10).toString()),
  });
  deadline.watch(improvement.deadlineAt);
  const step =
    spec.step === undefined
      ? new ScriptedStep('analyzing', 'verification_error')
      : spec.step;
  return { jobSignal: job.signal, deadline, improvement, step };
}

/** The failure an answer saves, applied to the improvement of the scene. */
function failureOf(answer: FaultAnswer, scene: FaultScene): unknown {
  if (answer.next !== 'fail') {
    return answer;
  }
  answer.change(scene.improvement, minutesIn(11));
  const { failure } = scene.improvement;
  return { reason: failure?.reason, message: failure?.message };
}

describe('answerTo', () => {
  describe('when the job was stopped', () => {
    it('should throw what came on, even a fault that may pass', () => {
      const job = new AbortController();
      job.abort(new JobStoppedError('user_cancelled'));

      expect(() => answerTo(PASSING, sceneOf({ job }))).toThrow(PASSING);
    });
  });

  describe('when the lease was lost', () => {
    it('should throw the loss on', () => {
      const lost = new LeaseLostError('Another worker holds the job.');

      expect(() => answerTo(lost, sceneOf())).toThrow(lost);
    });
  });

  describe('when a step failed after the deadline', () => {
    it('should fail with budget_exhausted, even on an error nobody foresaw', () => {
      const scene = sceneOf({ minute: 31 });

      const answer = answerTo(new TypeError('x is undefined'), scene);

      expect(failureOf(answer, scene)).toMatchObject({
        reason: 'budget_exhausted',
      });
    });
  });

  describe('when a move of the handler failed after the deadline', () => {
    it('should answer the fault, since the deadline of a wait is not settled', () => {
      const answer = answerTo(PASSING, sceneOf({ minute: 31, step: null }));

      expect(answer).toEqual({
        next: 'retry',
        reason: { code: 'tool_unavailable', message: 'It may pass.' },
      });
    });
  });

  describe('when the fault may pass', () => {
    it('should ask for a retry', () => {
      expect(answerTo(PASSING, sceneOf())).toMatchObject({ next: 'retry' });
    });
  });

  describe('when a save found another version', () => {
    it('should ask for a retry', () => {
      const stale = new StaleImprovementError('It moved on.');

      expect(answerTo(stale, sceneOf())).toEqual({
        next: 'retry',
        reason: { code: 'stale_improvement', message: 'It moved on.' },
      });
    });
  });

  describe('when the fault of a step will not pass', () => {
    it('should fail with the reason of the step', () => {
      const scene = sceneOf({
        step: new ScriptedStep('analyzing', 'mutation_unsupported'),
      });

      expect(failureOf(answerTo(LASTING, scene), scene)).toEqual({
        reason: 'mutation_unsupported',
        message:
          'The work of analyzing stopped on the fault tool_unavailable: It ' +
          'will not pass.',
      });
    });
  });

  describe('when the fault of a move of the handler will not pass', () => {
    it('should throw it on, since no step names a reason', () => {
      expect(() => answerTo(LASTING, sceneOf({ step: null }))).toThrow(LASTING);
    });
  });

  describe('when the error is of no known kind', () => {
    it('should throw it on', () => {
      const unknown = new RangeError('Out of range.');

      expect(() => answerTo(unknown, sceneOf())).toThrow(unknown);
    });
  });
});
