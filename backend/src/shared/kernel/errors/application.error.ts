/**
 * A use case that cannot go on, such as a lost lease or a conflict found
 * before a write. Every error of an application layer extends it.
 */
export abstract class ApplicationError extends Error {
  /** A stable name of the error, for HTTP answers and job failures. */
  public abstract readonly code: string;

  /** Whether running the same operation again can help. */
  public abstract readonly retryable: boolean;

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
