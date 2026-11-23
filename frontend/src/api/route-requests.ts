import {
  REQUEST_KEY_HEADER,
  type RequestKey,
} from '@coverage-autopilot/api-contracts/request-key';

/** One request to a route of the service, in the words of the client. */
export interface SocketRequest {
  readonly method: 'GET' | 'POST';
  /** The path with its query, such as `/improvements?status=failed`. */
  readonly path: string;
  /** Sent as JSON. Left out, the request has no body at all. */
  readonly body?: unknown;
  /** The key of a command that starts work. */
  readonly key?: RequestKey;
}

/** A request as it goes over the socket. */
export interface WireRequest {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  /** No payload is no body, which the service reads as an empty one. */
  readonly payload: string | undefined;
}

/** The values of a query of the contract, any of which may be left out. */
type Query = Readonly<Record<string, string | number | undefined>>;

/** A `GET` of the path. */
export function getRequest(path: string): SocketRequest {
  return { method: 'GET', path };
}

/** A `POST` of the path, with the body and the key that are given. */
export function postRequest(
  path: string,
  sent: Pick<SocketRequest, 'body' | 'key'> = {},
): SocketRequest {
  return { method: 'POST', path, ...sent };
}

/** A path of the service, with every part of it escaped, such as an id. */
export function pathOf(...parts: readonly string[]): string {
  return parts.map((part) => `/${encodeURIComponent(part)}`).join('');
}

/** The path with the values of the query that are there, and no others. */
export function withQuery(path: string, query: Query = {}): string {
  const values = Object.entries(query).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, String(value)]],
  );
  return values.length === 0
    ? path
    : `${path}?${new URLSearchParams(values).toString()}`;
}

/** The headers and the payload a request is sent with. */
export function wireOf(request: SocketRequest): WireRequest {
  const payload =
    request.body === undefined ? undefined : JSON.stringify(request.body);
  const headers = {
    ...(payload === undefined
      ? {}
      : {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(payload)),
        }),
    ...(request.key === undefined ? {} : { [REQUEST_KEY_HEADER]: request.key }),
  };
  return { method: request.method, path: request.path, headers, payload };
}
