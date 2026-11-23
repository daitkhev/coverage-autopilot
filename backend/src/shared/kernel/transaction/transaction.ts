declare const opaque: unique symbol;

/**
 * An open database transaction, as the domain and the application see it:
 * a handle to pass on and nothing to read. No object can be one by
 * accident, so only the transaction manager can make one, and only an
 * adapter of the same database can use it.
 */
export interface Transaction {
  readonly [opaque]: never;
}
