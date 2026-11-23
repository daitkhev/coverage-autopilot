import { type IncomingMessage, request } from 'node:http';
import { text } from 'node:stream/consumers';

import { type SocketRequest, wireOf } from '#api/route-requests';
import type { SocketReply } from '#api/service-answers';
import { ServiceTimeoutError } from '#api/service-timeout-error';
import { ServiceUnreachableError } from '#api/service-unreachable-error';

/**
 * How long one request may take, from the connection to the last byte of
 * its answer. No route holds a connection for long: a scan and an
 * improvement run in jobs and are asked about again. The longest routes
 * by design ask the host of a repository with git and gh, the connect
 * and the access check, and take seconds; the service stops their tools
 * when the client goes away. A service that has not answered by then
 * will not.
 */
const ANSWER_LIMIT_MS = 30_000;

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

/** One request to the socket, and the moment it gives up on its answer. */
interface Exchange {
  readonly socketPath: string;
  readonly limitMs: number;
  readonly deadline: AbortSignal;
}

function isUnreachable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    UNREACHABLE_CODES.has(error.code)
  );
}

/**
 * The fault of a failed request. One that ran out of time is cut by the
 * client, which also reads as a cut connection, so the time is asked
 * first.
 */
function failureOf(error: unknown, sent: Exchange): unknown {
  if (sent.deadline.aborted) {
    return new ServiceTimeoutError(sent.socketPath, sent.limitMs, {
      cause: error,
    });
  }
  return isUnreachable(error)
    ? new ServiceUnreachableError(sent.socketPath, { cause: error })
    : error;
}

/**
 * Every request opens a connection of its own and closes it. A pooled
 * one could still lead to a service that was replaced since.
 */
async function responseTo(
  exchanged: Exchange,
  sent: SocketRequest,
): Promise<IncomingMessage> {
  const wire = wireOf(sent);
  return new Promise((resolve, reject) => {
    request(
      {
        socketPath: exchanged.socketPath,
        agent: false,
        method: wire.method,
        path: wire.path,
        headers: wire.headers,
        signal: exchanged.deadline,
      },
      resolve,
    )
      .on('error', reject)
      .end(wire.payload);
  });
}

/**
 * Sends one request over the socket and reads the whole answer within
 * the limit, which a test makes short. A socket nothing answers on is a
 * `ServiceUnreachableError` and an answer that did not come in time a
 * `ServiceTimeoutError`, each with the failure as its cause; any other
 * failure is thrown as it came.
 */
export async function exchange(
  socketPath: string,
  sent: SocketRequest,
  limitMs: number = ANSWER_LIMIT_MS,
): Promise<SocketReply> {
  const exchanged = {
    socketPath,
    limitMs,
    deadline: AbortSignal.timeout(limitMs),
  };
  try {
    const response = await responseTo(exchanged, sent);
    return { status: response.statusCode ?? 0, text: await text(response) };
  } catch (error) {
    throw failureOf(error, exchanged);
  }
}
