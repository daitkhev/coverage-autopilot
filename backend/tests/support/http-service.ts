import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

import type { ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { API_ERROR_FILTER } from '#infrastructure/http/api-error.filter';
import { LOGGER } from '#ports/logger.port';
import { RecordingLogger } from '#tests/support/recording-logger';

/**
 * Short enough for the path of a socket in it. The temporary folder of
 * macOS is under `/var/folders/` and leaves too few of the 104 bytes.
 */
const SHORT_ROOT = '/tmp';

type Method = 'GET' | 'POST';

interface Sent {
  /** Sent as JSON. Left out, the request has no body. */
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Sent as it is, for a body that is not JSON. */
  readonly text?: string;
}

/** The status and the body of an answer, read as JSON when it has one. */
interface HttpAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** Routes that listen on a Unix socket, as the service does. */
export interface HttpService {
  /** What the routes and the filter wrote. */
  readonly logger: RecordingLogger;
  send(method: Method, path: string, sent?: Sent): Promise<HttpAnswer>;
  close(): Promise<void>;
}

function payloadOf(sent: Sent): string | undefined {
  return (
    sent.text ??
    (sent.body === undefined ? undefined : JSON.stringify(sent.body))
  );
}

function ask(
  socketPath: string,
  line: { readonly method: Method; readonly path: string },
  sent: Sent,
): Promise<HttpAnswer> {
  const payload = payloadOf(sent);
  const headers = {
    ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    ...sent.headers,
  };
  return new Promise((resolve, reject) => {
    const outgoing = request({ socketPath, ...line, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: incoming.statusCode ?? 0,
          body: text === '' ? null : (JSON.parse(text) as unknown),
        });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(payload);
  });
}

/**
 * Starts the controllers and providers of a test behind the error filter
 * of the service, on a socket in a folder of its own. `close` stops the
 * routes and removes the folder.
 */
export async function startHttpService(
  metadata: ModuleMetadata,
): Promise<HttpService> {
  const logger = new RecordingLogger();
  const testing = await Test.createTestingModule({
    ...metadata,
    providers: [
      ...(metadata.providers ?? []),
      { provide: LOGGER, useValue: logger },
      API_ERROR_FILTER,
    ],
  }).compile();
  const application = testing.createNestApplication();
  application.useLogger(false);
  const folder = mkdtempSync(join(SHORT_ROOT, 'routes-'));
  const socketPath = join(folder, 'service.sock');
  await application.listen(socketPath);
  return {
    logger,
    send: (method, path, sent = {}) => ask(socketPath, { method, path }, sent),
    close: async () => {
      await application.close();
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
