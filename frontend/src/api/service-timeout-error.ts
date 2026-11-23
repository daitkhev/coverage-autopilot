/** A limit is kept in milliseconds and said in seconds. */
const MS_PER_SECOND = 1000;

/**
 * The service took the request and did not answer it within the limit:
 * it hangs, or holds its answer back. Unlike a socket nothing answers on,
 * a service holds the socket, so no other one can be started in its
 * place. It names the socket and the limit, so a person knows which
 * service was asked and how long the client waited.
 */
export class ServiceTimeoutError extends Error {
  public readonly socketPath: string;
  public readonly limitMs: number;

  public constructor(
    socketPath: string,
    limitMs: number,
    options?: ErrorOptions,
  ) {
    const seconds = String(limitMs / MS_PER_SECOND);
    super(
      `The service on the socket ${socketPath} did not answer in ${seconds} seconds.`,
      options,
    );
    this.name = 'ServiceTimeoutError';
    this.socketPath = socketPath;
    this.limitMs = limitMs;
  }
}
