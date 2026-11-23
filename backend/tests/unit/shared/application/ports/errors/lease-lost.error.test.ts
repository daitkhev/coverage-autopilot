import { describe, expect, it } from 'vitest';

import { ApplicationError } from '#kernel/errors/application.error';
import { LeaseLostError } from '#ports/errors/lease-lost.error';

describe('LeaseLostError', () => {
  it('should be an error of the application that a rerun does not help', () => {
    const error = new LeaseLostError('Job 1 is no longer leased.');

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      name: 'LeaseLostError',
      code: 'lease_lost',
      retryable: false,
    });
  });
});
