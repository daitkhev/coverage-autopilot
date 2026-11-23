import { DomainError } from '#kernel/errors/domain.error';

/** A value made of what a client sent, or the words of the rule it broke. */
export type RequestValue<Value> =
  | { readonly outcome: 'valid'; readonly value: Value }
  | { readonly outcome: 'invalid'; readonly message: string };

/**
 * Makes a value of what a client sent. A value object throws the error of
 * the rule a value breaks; for a value a client sent, that is an answer
 * to the client and not a fault of the service, so it comes back as a
 * value. Any other error is a fault and is thrown on.
 */
export function requestValueOf<Value>(make: () => Value): RequestValue<Value> {
  try {
    return { outcome: 'valid', value: make() };
  } catch (error) {
    if (error instanceof DomainError) {
      return { outcome: 'invalid', message: error.message };
    }
    throw error;
  }
}

/**
 * The value, or `null` when what the client sent breaks a rule of it. A
 * query asks for what has such a value, and nothing has one that breaks
 * a rule, so it finds nothing rather than refuse.
 */
export function requestValueOrNull<Value>(make: () => Value): Value | null {
  const made = requestValueOf(make);
  return made.outcome === 'valid' ? made.value : null;
}
