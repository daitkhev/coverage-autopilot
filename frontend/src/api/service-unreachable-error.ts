/**
 * Nothing answers on the socket of the service: it is not running, or it
 * died. It names the socket, so a person knows which service was asked.
 */
export class ServiceUnreachableError extends Error {
  public readonly socketPath: string;

  public constructor(socketPath: string, options?: ErrorOptions) {
    super(`Nothing answers on the socket ${socketPath}.`, options);
    this.name = 'ServiceUnreachableError';
    this.socketPath = socketPath;
  }
}

/**
 * Whether a request failed because nothing answers on the socket. A
 * screen keeps its last answer then, and says only that it is not fresh.
 */
export function isServiceUnreachable(
  failure: unknown,
): failure is ServiceUnreachableError {
  return failure instanceof ServiceUnreachableError;
}
