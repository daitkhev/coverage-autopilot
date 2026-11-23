import { DomainError } from '#kernel/errors/domain.error';

/** A mutant with no mutator, or with a place in the file that is not one. */
export class InvalidMutantError extends DomainError {
  public readonly code = 'invalid_mutant';
  public readonly retryable = false;
}
