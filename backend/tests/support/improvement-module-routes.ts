import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { type IncomingMessage, request } from 'node:http';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

import type { INestApplication } from '@nestjs/common';

/** Short enough for the 104 bytes of the path of a socket on macOS. */
const SHORT_ROOT = '/tmp';

interface RouteAnswer {
  readonly status: number;
  readonly body: unknown;
}

interface RouteRequest {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Sends a request to the routes, its body as JSON, and reads the answer. */
type RouteSender = (
  method: 'GET' | 'POST',
  path: string,
  sent?: RouteRequest,
) => Promise<RouteAnswer>;

/** The routes of a module that runs as the service, once they listen. */
export interface ModuleRoutes {
  /** Starts the routes on a socket in a folder of their own. */
  readonly listen: () => Promise<RouteSender>;
  /** Stops the module, and removes the folder of the socket if there is one. */
  readonly close: () => Promise<void>;
}

function senderOn(socketPath: string): RouteSender {
  return async (method, path, sent = {}) => {
    const outgoing = request({
      socketPath,
      method,
      path,
      headers: { 'content-type': 'application/json', ...sent.headers },
    });
    outgoing.end(sent.body === undefined ? '' : JSON.stringify(sent.body));
    const [incoming] = (await once(outgoing, 'response')) as [IncomingMessage];
    const body = await text(incoming);
    return {
      status: incoming.statusCode ?? 0,
      body: body === '' ? null : (JSON.parse(body) as unknown),
    };
  };
}

/**
 * The routes of a module built by a test, so a journey reaches them as a
 * client does and the same test still drives the worker of the module.
 */
export function moduleRoutes(application: INestApplication): ModuleRoutes {
  let folder: string | undefined;
  return {
    listen: async () => {
      folder = mkdtempSync(join(SHORT_ROOT, 'module-'));
      const socketPath = join(folder, 'service.sock');
      await application.listen(socketPath);
      return senderOn(socketPath);
    },
    close: async () => {
      await application.close();
      if (folder !== undefined) {
        rmSync(folder, { recursive: true, force: true });
      }
    },
  };
}
