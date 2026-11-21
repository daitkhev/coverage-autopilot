import { DomainError } from '#kernel/errors/domain.error';

/**
 * A patch of an attempt that already keeps another one, or a report of a
 * patch that is not the kept one. The kept patch is written once and is
 * the truth, so running the step again cannot help.
 */
export class PatchIntegrityError extends DomainError {
  public readonly code = 'patch_integrity';
  public readonly retryable = false;
}
