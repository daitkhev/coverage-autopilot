import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/** A stored JSON document of a known version that does not have its shape. */
export class InvalidStoredDocumentError extends InfrastructureError {
  public readonly code = 'invalid_stored_document';
  public readonly retryable = false;
}
