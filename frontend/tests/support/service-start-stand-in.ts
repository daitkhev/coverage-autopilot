import { once } from 'node:events';
import { appendFileSync, existsSync, readFileSync, writeSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { argv, execPath, exit, pid } from 'node:process';
import { fileURLToPath } from 'node:url';

import { instanceLocationIn } from '#api/instance-location';
import type { ServiceCommand } from '#api/service-launch';

/** How the stand-in answers `POST /service/stop`. */
interface StandInStop {
  readonly status: number;
  readonly body: unknown;
  /** It closes its socket and leaves once it answered. */
  readonly leaves: boolean;
}

/** What one stand-in of the service does, as a test scripts it. */
export interface StandInPlay {
  /** Written to its standard error first, as a service writes its log. */
  readonly errors?: readonly string[];
  /** It leaves with this code once it wrote them. */
  readonly exitCode?: number;
  /** The body of its health. Left out, it never listens. */
  readonly health?: unknown;
  readonly stop?: StandInStop;
  /** It stays when it is asked to end, until it is killed. */
  readonly holdsOnTerm?: boolean;
}

/** The play, and the files of the bench that started it. */
export interface StandInScript extends StandInPlay {
  /** While this file is there, the stand-in stays. */
  readonly leash: string;
  /** It adds its process id here once it wrote its errors. */
  readonly pids: string;
  /** It adds every request it receives here, as `METHOD path`. */
  readonly requests: string;
}

/** `argv` starts with Node and this file, then the script and the instance. */
const SCRIPT_ARGUMENT = 2;
const INSTANCE_ARGUMENT = 3;

const STANDARD_ERROR = 2;

/** How often the stand-in looks for its leash. */
const LEASH_MS = 25;

const OK = 200;
const NOT_FOUND = 404;
const FIRST_REFUSAL = 400;

/**
 * The command that starts a stand-in playing the script in that file. The
 * stand-in reads no variable, so a shell hands it the instance directory
 * the client gave the service, as an argument, and gives way to it.
 */
export function standInCommand(scriptFile: string): ServiceCommand {
  return [
    '/bin/sh',
    '-c',
    'exec "$0" "$1" "$2" "$AUTOPILOT_INSTANCE_DIR"',
    execPath,
    fileURLToPath(import.meta.url),
    scriptFile,
  ];
}

function answer(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** Answers its health and its stop, and leaves after a stop it accepted. */
function serve(
  script: StandInScript,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const route = `${request.method ?? ''} ${request.url ?? ''}`;
  appendFileSync(script.requests, `${route}\n`);
  const { stop } = script;
  if (route === 'GET /health') {
    answer(response, OK, script.health);
  } else if (route === 'POST /service/stop' && stop !== undefined) {
    answer(response, stop.status, stop.body);
    if (stop.leaves && stop.status < FIRST_REFUSAL) {
      response.once('finish', () => {
        exit(0);
      });
    }
  } else {
    answer(response, NOT_FOUND, { error: 'not_found', message: route });
  }
}

async function listen(script: StandInScript, socket: string): Promise<void> {
  const server = createServer((request, response) => {
    serve(script, request, response);
  });
  server.listen(socket);
  await once(server, 'listening');
  // A stop it accepted ends the process, and the socket goes with it.
  process.once('exit', () => {
    server.close();
  });
}

async function play(script: StandInScript, socket: string): Promise<void> {
  for (const line of script.errors ?? []) {
    writeSync(STANDARD_ERROR, `${line}\n`);
  }
  appendFileSync(script.pids, `${String(pid)}\n`);
  if (script.exitCode !== undefined) {
    exit(script.exitCode);
  }
  if (script.holdsOnTerm === true) {
    process.on('SIGTERM', () => undefined);
  }
  setInterval(() => {
    if (!existsSync(script.leash)) {
      exit(0);
    }
  }, LEASH_MS);
  if (script.health !== undefined) {
    await listen(script, socket);
  }
}

if (import.meta.main) {
  const file = argv[SCRIPT_ARGUMENT] ?? '';
  const { socket } = instanceLocationIn(argv[INSTANCE_ARGUMENT] ?? '');
  await play(JSON.parse(readFileSync(file, 'utf8')) as StandInScript, socket);
}
