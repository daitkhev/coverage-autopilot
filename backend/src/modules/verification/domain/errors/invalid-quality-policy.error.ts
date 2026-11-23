import { DomainError } from '#kernel/errors/domain.error';

/** Settings of the gate it cannot work with, such as no run of the tests. */
export class InvalidQualityPolicyError extends DomainError {
  public readonly code = 'invalid_quality_policy';
  public readonly retryable = false;
}
