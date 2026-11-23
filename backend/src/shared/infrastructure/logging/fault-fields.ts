import { ApplicationError } from '#kernel/errors/application.error';
import { DomainError } from '#kernel/errors/domain.error';
import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import type { LogFields } from '#ports/logger.port';

/** A message of an error can hold the output of a tool, which is long. */
const MESSAGE_CHARACTERS = 2_000;

/** The code of an error nobody foresaw. */
const UNEXPECTED = 'unexpected';

function isTyped(
  error: unknown,
): error is DomainError | ApplicationError | InfrastructureError {
  return (
    error instanceof DomainError ||
    error instanceof ApplicationError ||
    error instanceof InfrastructureError
  );
}

/** An error as fields of a line: its code and the start of its message. */
export function faultFieldsOf(error: unknown): LogFields {
  const message = error instanceof Error ? error.message : String(error);
  return {
    errorCode: isTyped(error) ? error.code : UNEXPECTED,
    errorMessage: message.slice(0, MESSAGE_CHARACTERS),
  };
}
