import type {
  ImprovementStep,
  StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import type { RunDeadline } from '#improvement/application/commands/run-improvement/run-deadline';
import {
  budgetExhausted,
  type Change,
  faultOfStep,
} from '#improvement/application/commands/run-improvement/run-failures';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { StaleImprovementError } from '#improvement/domain/errors/stale-improvement.error';
import { ApplicationError } from '#kernel/errors/application.error';
import { DomainError } from '#kernel/errors/domain.error';
import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import { LeaseLostError } from '#ports/errors/lease-lost.error';

/** Run the same move again, or end the improvement with a failure. */
export type FaultAnswer =
  | Extract<StepResult, { readonly next: 'retry' }>
  | { readonly next: 'fail'; readonly change: Change };

/** Where a fault came from, as far as the answer to it depends on it. */
export interface FaultScene {
  /** Aborted by the worker: a cancel, a shutdown or a lost lease. */
  readonly jobSignal: AbortSignal;
  readonly deadline: RunDeadline;
  /** The improvement as it was last saved. */
  readonly improvement: Improvement;
  /** The step that ran, or `null` for a move of the handler itself. */
  readonly step: ImprovementStep | null;
}

type Fault = DomainError | ApplicationError | InfrastructureError;

function isFault(error: unknown): error is Fault {
  return (
    error instanceof DomainError ||
    error instanceof ApplicationError ||
    error instanceof InfrastructureError
  );
}

/**
 * A save that found another version is retried: the next run reads the
 * improvement anew and decides on what it finds, such as a cancel.
 */
function answerToFault(
  error: unknown,
  step: ImprovementStep | null,
): FaultAnswer {
  if (!isFault(error)) {
    throw error;
  }
  if (error.retryable || error instanceof StaleImprovementError) {
    const { code, message } = error;
    return { next: 'retry', reason: { code, message } };
  }
  if (step === null) {
    throw error;
  }
  return { next: 'fail', change: faultOfStep(step, error) };
}

/**
 * The answer to an error of one move of a run. What the worker handles
 * is thrown on as it came: a stop, a lost lease, an error nobody foresaw,
 * and a fault of a move of the handler, which has no reason to fail with.
 * A step that failed once the deadline passed spent the budget, whatever
 * its error says.
 */
export function answerTo(error: unknown, scene: FaultScene): FaultAnswer {
  if (scene.jobSignal.aborted || error instanceof LeaseLostError) {
    throw error;
  }
  if (scene.step !== null && scene.deadline.hasPassed()) {
    return { next: 'fail', change: budgetExhausted(scene.improvement) };
  }
  return answerToFault(error, scene.step);
}
