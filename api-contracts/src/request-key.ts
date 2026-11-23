import { z } from 'zod';

const REQUEST_KEY_MAX_LENGTH = 128;

/** The header a command that starts work carries its request key in. */
export const REQUEST_KEY_HEADER = 'Idempotency-Key';

/**
 * The key is stored and compared as text, so it is kept to characters
 * that need no escaping in a header, a log line or a query.
 */
export const requestKeySchema = z
  .string()
  .min(1)
  .max(REQUEST_KEY_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

export type RequestKey = z.infer<typeof requestKeySchema>;
