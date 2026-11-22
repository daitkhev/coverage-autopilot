import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type { FailureReason } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';
import type { RetryReason } from '#ports/job-handler.port';

/**
 * `continue`: the step saved what it did, and the handler looks at the
 * status again. `retry`: the same step must run again as a technical
 * retry, which the queue counts, and nothing was spent of the budget.
 */
export type StepResult =
  | { readonly next: 'continue' }
  | { readonly next: 'retry'; readonly reason: RetryReason };

/**
 * The work of one status of an improvement. A step can be run again on
 * the same improvement: after a crash it finds what the run before it
 * saved and repeats only what is missing.
 *
 * An expected end is saved by the step itself, as a move of the status,
 * a skip or a failure with its reason. A fault is thrown as it came, and
 * the handler decides: a fault that may pass is retried, and one that
 * will not fails the improvement with `faultReason`. A step never catches
 * an aborted signal: it releases what it holds and lets the error pass.
 */
export interface ImprovementStep {
  /** The status whose work the step does. */
  readonly status: ImprovementStatus;
  /** Why the improvement fails when a fault of this step cannot pass. */
  readonly faultReason: FailureReason;
  run(run: ImprovementRun): Promise<StepResult>;
}

/** The injection token of the list of every step. */
export const IMPROVEMENT_STEPS = Symbol('ImprovementSteps');
