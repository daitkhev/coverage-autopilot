/**
 * A fault of something outside the code: the database, the file system, a
 * tool the service starts. Every error of an adapter extends it.
 */
export abstract class InfrastructureError extends Error {
  /** A stable name of the error, for HTTP answers and job failures. */
  public abstract readonly code: string;

  /** Whether running the same operation again can help. */
  public abstract readonly retryable: boolean;

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
