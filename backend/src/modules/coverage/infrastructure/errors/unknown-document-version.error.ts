import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A stored JSON document of a version this service does not read: a newer
 * service wrote it, or a migration forgot it. Reading it again gives the
 * same answer, so it is not retried.
 */
export class UnknownDocumentVersionError extends InfrastructureError {
  public readonly code = 'unknown_document_version';
  public readonly retryable = false;
}
