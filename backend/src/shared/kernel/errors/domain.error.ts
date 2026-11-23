/**
 * A rule of the domain that a value or an aggregate broke. Every error of a
 * domain extends it, so one boundary can tell it from a fault outside.
 */
export abstract class DomainError extends Error {
  /** A stable name of the error, for HTTP answers and job failures. */
  public abstract readonly code: string;

  /** Whether running the same operation again can help. */
  public abstract readonly retryable: boolean;

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
