import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ServiceLife } from '#infrastructure/http/service-life';

/** A step every request takes before its route, as Express calls it. */
type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

/**
 * Once a stop was asked, every answer closes its connection. The server
 * of a service that stops waits for each connection that was busy as it
 * closed, and Node answers on such a connection for as long as its client
 * goes on asking: a client that polls would keep the service up forever.
 */
export function closingOnStop(life: ServiceLife): Middleware {
  return (_request, response, next) => {
    if (life.stopping) {
      response.setHeader('connection', 'close');
    }
    next();
  };
}
