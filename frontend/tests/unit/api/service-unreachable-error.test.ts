import { describe, expect, it } from 'vitest';

import { ServiceUnreachableError } from '#api/service-unreachable-error';

const SOCKET = '/tmp/coverage-autopilot/service.sock';

describe('ServiceUnreachableError', () => {
  it('should name the socket that did not answer', () => {
    const error = new ServiceUnreachableError(SOCKET);

    expect(error.message).toBe(
      'Nothing answers on the socket /tmp/coverage-autopilot/service.sock.',
    );
    expect(error.socketPath).toBe(SOCKET);
    expect(error.name).toBe('ServiceUnreachableError');
  });

  it('should keep the failure of the socket as its cause', () => {
    const refused = new Error('connect ECONNREFUSED');

    expect(new ServiceUnreachableError(SOCKET, { cause: refused }).cause).toBe(
      refused,
    );
  });
});
