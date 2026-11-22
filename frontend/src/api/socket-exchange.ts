import { type IncomingMessage, request } from 'node:http';
import { text } from 'node:stream/consumers';

import { type SocketRequest, wireOf } from '#api/route-requests';
import type { SocketReply } from '#api/service-answers';
import { ServiceUnreachableError } from '#api/service-unreachable-error';

/**
 * The codes of a socket nothing answers on: no file or no socket at the
 * path, a socket no process listens on, and a connection that was cut,
 * also in the middle of an answer.
 */
const UNREACHABLE_CODES: ReadonlySet<string> = new Set([
  'ENOENT',
  'ENOTSOCK',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
]);

function isUnreachable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    UNREACHABLE_CODES.has(error.code)
  );
}

/**
 * Every request opens a connection of its own and closes it. A pooled
 * one could still lead to a service that was replaced since.
 */
async function responseTo(
  socketPath: string,
  sent: SocketRequest,
): Promise<IncomingMessage> {
  const wire = wireOf(sent);
  return new Promise((resolve, reject) => {
    request(
      {
        socketPath,
        agent: false,
        method: wire.method,
        path: wire.path,
        headers: wire.headers,
      },
      resolve,
    )
      .on('error', reject)
      .end(wire.payload);
  });
}

/**
 * Sends one request over the socket and reads the whole answer. A socket
 * nothing answers on is a `ServiceUnreachableError` with the failure as
 * its cause, and any other failure is thrown as it came.
 */
export async function exchange(
  socketPath: string,
  sent: SocketRequest,
): Promise<SocketReply> {
  try {
    const response = await responseTo(socketPath, sent);
    return { status: response.statusCode ?? 0, text: await text(response) };
  } catch (error) {
    throw isUnreachable(error)
      ? new ServiceUnreachableError(socketPath, { cause: error })
      : error;
  }
}
