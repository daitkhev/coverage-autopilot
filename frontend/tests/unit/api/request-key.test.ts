import { describe, expect, it } from 'vitest';

import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import { requestKeySchema } from '@coverage-autopilot/api-contracts/request-key';

import { newRequestKey } from '#api/request-key';

describe('newRequestKey', () => {
  it('should make a key the contract accepts', () => {
    const key = newRequestKey();

    expect(parseAs(requestKeySchema, key)).toBe(key);
  });

  it('should make another key for another action', () => {
    expect(newRequestKey()).not.toBe(newRequestKey());
  });
});
