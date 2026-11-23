import type { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';

/**
 * Makes the fingerprint of a request from its canonical text. Which parts
 * of a request count, and in which order, is decided by the application;
 * hashing needs the crypto of the runtime, which only an adapter loads.
 */
export interface RequestHasher {
  /** The SHA-256 of the text in UTF-8, in lower-case hex. */
  fingerprintOf(canonicalText: string): RequestFingerprint;
}

/** The injection token of the hasher of requests. */
export const REQUEST_HASHER = Symbol('RequestHasher');
