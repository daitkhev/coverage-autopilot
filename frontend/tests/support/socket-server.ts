import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

/** One request the server received, as it came. */
interface ReceivedRequest {
  readonly method: string;
  /** The path with its query. */
  readonly url: string;
  /** Node gives the name of every header in lower case. */
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/**
 * What the server does with every request: answers a status with a body
 * as JSON or as text, writes bytes that are no HTTP, or cuts the
 * connection before or within its answer.
 */
type ScriptedAnswer =
  | { readonly status: number; readonly body: unknown }
  | { readonly status: number; readonly text: string }
  | { readonly raw: string }
  | { readonly cut: 'before_the_answer' | 'within_the_answer' };

/** A server on a Unix socket that answers what a test scripted. */
export interface ScriptedServer {
  readonly socket: string;
  /** Every request so far, in the order it came. */
  readonly received: readonly ReceivedRequest[];
  /** Every request from now on is answered so. */
  answerWith(answer: ScriptedAnswer): void;
  /** Stops the server and removes its folder. */
  close(): Promise<void>;
}

/** Short enough for a socket: the temporary folder of macOS is not. */
const SHORT_ROOT = '/tmp';

const OK = 200;
const FAULT = 500;

const NOT_SCRIPTED: ScriptedAnswer = { status: FAULT, text: 'not scripted' };

/** The length an answer cut within itself promised and never sent. */
const PROMISED_LENGTH = '100';

function play(
  answer: ScriptedAnswer,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if ('cut' in answer) {
    if (answer.cut === 'within_the_answer') {
      response.writeHead(OK, { 'content-length': PROMISED_LENGTH });
      response.write('{"cut":');
    }
    request.socket.destroy();
    return;
  }
  if ('raw' in answer) {
    request.socket.end(answer.raw);
    return;
  }
  const json = 'body' in answer;
  response.writeHead(answer.status, {
    'content-type': json ? 'application/json' : 'text/plain',
  });
  response.end(json ? JSON.stringify(answer.body) : answer.text);
}

/**
 * Starts a server in a new folder under `/tmp`. It answers 500 until a
 * test scripts it.
 */
export async function startScriptedServer(): Promise<ScriptedServer> {
  const folder = mkdtempSync(join(SHORT_ROOT, 'socket-'));
  const socket = join(folder, 'service.sock');
  const received: ReceivedRequest[] = [];
  let answer = NOT_SCRIPTED;
  const receive = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const body = await text(request);
    const { method = '', url = '', headers } = request;
    received.push({ method, url, headers, body });
    play(answer, request, response);
  };
  const server = createServer((request, response) => {
    void receive(request, response);
  });
  server.listen(socket);
  await once(server, 'listening');
  return {
    socket,
    received,
    answerWith: (next) => {
      answer = next;
    },
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
