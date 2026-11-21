import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The request names a version of the prompt the adapter does not have.
 * The version is stored with an improvement, so this is a mistake of the
 * settings or of the data, and running again does not help.
 */
export class UnknownPromptVersionError extends InfrastructureError {
  public readonly code = 'unknown_prompt_version';
  public readonly retryable = false;
}
