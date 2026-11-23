import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type { ImprovementStep } from '#improvement/application/commands/run-improvement/improvement-step';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  type FailureReason,
  ImprovementFailure,
  isSentence,
} from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ApplicationError } from '#kernel/errors/application.error';

/** A change of an improvement, as a run saves it. */
export type Change = Parameters<ImprovementRun['save']>[0];

/** What a typed fault says of itself, whatever layer it comes from. */
type FaultText = Pick<ApplicationError, 'code' | 'message'>;

/** The change that ends the improvement as failed. */
export function failedWith(reason: FailureReason, message: string): Change {
  const failure = ImprovementFailure.create({ reason, message });
  return (improvement, at) => {
    improvement.fail(failure, at);
  };
}

/** The deadline passed before the work was done. */
export function budgetExhausted(improvement: Improvement): Change {
  const minutes = String(improvement.request.budget.minutes);
  return failedWith(
    'budget_exhausted',
    `The deadline passed: the ${minutes} minutes of work of the budget ` +
      'are spent.',
  );
}

/** A job another version of the service wrote, which this one cannot run. */
export function unreadablePayload(version: number): Change {
  return failedWith(
    'retries_exhausted',
    `The job has the payload version ${String(version)}, which another ` +
      'version of the service wrote and this one cannot run.',
  );
}

/** Every run of the job the queue allows ended in a fault. */
export function retriesExhausted(): Change {
  return failedWith(
    'retries_exhausted',
    'Every run of its job that the queue allows ended in a fault, so the ' +
      'work was given up.',
  );
}

/**
 * A fault that will not pass, with the reason of the step it stopped. The
 * message of a fault comes from anywhere, so one too long for a sentence
 * is left out and the code alone is kept.
 */
export function faultOfStep(step: ImprovementStep, fault: FaultText): Change {
  const opening = `The work of ${step.status} stopped on the fault ${fault.code}:`;
  const sentence = `${opening} ${fault.message}`;
  return failedWith(
    step.faultReason,
    isSentence(sentence)
      ? sentence
      : `${opening} its message was too long to keep.`,
  );
}
