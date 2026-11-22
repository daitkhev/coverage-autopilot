import { randomUUID } from 'node:crypto';

import type { RequestKey } from '@coverage-autopilot/api-contracts/request-key';

/**
 * A new key for one action of a person. A retry of that action sends the
 * same key, so the service finds the work it started and starts no more.
 */
export function newRequestKey(): RequestKey {
  return randomUUID();
}
