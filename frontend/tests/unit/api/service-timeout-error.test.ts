import { describe, expect, it } from 'vitest';

import { ServiceTimeoutError } from '#api/service-timeout-error';
import { isServiceUnreachable } from '#api/service-unreachable-error';

const SOCKET = '/tmp/coverage-autopilot/service.sock';

describe('ServiceTimeoutError', () => {
  it('should name the socket and the limit in seconds', () => {
    const error = new ServiceTimeoutError(SOCKET, 30_000);

    expect(error.message).toBe(
      'The service on the socket /tmp/coverage-autopilot/service.sock did not answer in 30 seconds.',
    );
    expect(error.socketPath).toBe(SOCKET);
    expect(error.limitMs).toBe(30_000);
    expect(error.name).toBe('ServiceTimeoutError');
  });

  it('should keep the failure of the request as its cause', () => {
    const cut = new Error('The operation was aborted');

    expect(new ServiceTimeoutError(SOCKET, 50, { cause: cut }).cause).toBe(cut);
  });

  it('should not be taken for a socket nothing answers on', () => {
    expect(isServiceUnreachable(new ServiceTimeoutError(SOCKET, 50))).toBe(
      false,
    );
  });
});
