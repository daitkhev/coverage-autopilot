import { DomainError } from '#kernel/errors/domain.error';

/** A text that git would not take as the name of a branch. */
export class InvalidBranchNameError extends DomainError {
  public readonly code = 'invalid_branch_name';
  public readonly retryable = false;
}
