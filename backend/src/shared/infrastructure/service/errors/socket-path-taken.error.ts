import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * Something that is not a socket is where the service listens. The service
 * made none of it, so it leaves it there, and a person has to move it.
 */
export class SocketPathTakenError extends InfrastructureError {
  public readonly code = 'socket_path_taken';
  public readonly retryable = false;
}
