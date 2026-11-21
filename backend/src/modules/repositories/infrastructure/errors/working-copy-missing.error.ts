import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/** No folder holds the copy of an id: never made, or disposed of. */
export class WorkingCopyMissingError extends InfrastructureError {
  public readonly code = 'working_copy_missing';
  public readonly retryable = false;
}
