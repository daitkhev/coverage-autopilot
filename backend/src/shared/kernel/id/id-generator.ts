/**
 * Makes the ids of new objects. The domain and the application take one
 * instead of calling `randomUUID()`, so a test can give ids in sequence.
 */
export interface IdGenerator {
  /** A new UUID in lower case, never given out before. */
  generate(): string;
}

/** The injection token of the id generator. */
export const ID_GENERATOR = Symbol('IdGenerator');
