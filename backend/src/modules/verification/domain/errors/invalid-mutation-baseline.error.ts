import { DomainError } from '#kernel/errors/domain.error';

/** A measure of the mutants that does not add up or names no tool. */
export class InvalidMutationBaselineError extends DomainError {
  public readonly code = 'invalid_mutation_baseline';
  public readonly retryable = false;
}
