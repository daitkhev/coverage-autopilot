import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { execPath } from 'node:process';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { createInstanceFolder } from '#tests/support/instance-folder';
import { playingEngine } from '#tests/support/playing-engine';
import { askOver } from '#tests/support/service-bench';

/** The service of the package the gate builds, at the root of the tree. */
export const BUILT_FILE = fileURLToPath(
  new URL('../../../dist/bin/service.js', import.meta.url),
);

/** Where git is found on a desk and in CI. Nothing else is on the path. */
const SEARCH_PATH = '/usr/bin:/bin';

type Answer = Awaited<ReturnType<typeof askOver>>;

/** The built service as a process of its own, in an instance of its own. */
export interface BuiltService {
  readonly paths: InstancePaths;
  /** Sends a request over the socket of the instance, as a client does. */
  send(path: string, asked?: Parameters<typeof askOver>[2]): Promise<Answer>;
  /** Sends the process a signal. */
  signal(name: NodeJS.Signals): void;
  /** The code the process ended with. */
  readonly exitCode: Promise<number | null>;
  /** Everything the process wrote to its standard error until it ended. */
  readonly errors: Promise<string>;
  /** What the process wrote to its standard error so far: its log. */
  log(): string;
  /** Ends a process that still runs, and removes the instance it made. */
  close(): Promise<void>;
}

async function exitCodeOf(child: ChildProcess): Promise<number | null> {
  const [code] = (await once(child, 'exit')) as [number | null];
  return code;
}

/** The text of a stream as it comes, and the whole of it once it ends. */
interface Written {
  soFar(): string;
  readonly whole: Promise<string>;
}

function writtenTo(stream: Readable): Written {
  const chunks: string[] = [];
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    chunks.push(chunk);
  });
  const soFar = (): string => chunks.join('');
  return {
    soFar,
    whole: (async () => {
      await finished(stream);
      return soFar();
    })(),
  };
}

/**
 * The variables of a service of the instance in `directory`: a path to
 * find git, a home beside the instance, the instance, and the stand-in of
 * the engine that plays the tools, so it reaches no container engine of
 * the machine. A client run with them hands them on to the service it
 * starts.
 */
export function builtServiceVariables(
  directory: string,
): Record<string, string> {
  return {
    PATH: SEARCH_PATH,
    HOME: dirname(directory),
    AUTOPILOT_INSTANCE_DIR: directory,
    AUTOPILOT_SANDBOX_ENGINE: JSON.stringify(playingEngine(dirname(directory))),
  };
}

/**
 * Starts the built file under plain Node. The process gets exactly the
 * variables of its own instance and what a test adds, and nothing of the
 * test process. A test that names the instance of another service shares
 * that instance.
 */
export function startBuiltService(
  variables: Readonly<Record<string, string>> = {},
): BuiltService {
  const folder = createInstanceFolder();
  const own = {
    ...builtServiceVariables(folder.paths.directory),
    ...variables,
  };
  const child = spawn(execPath, [BUILT_FILE], {
    env: own,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exitCode = exitCodeOf(child);
  const errors = writtenTo(child.stderr);
  return {
    paths: folder.paths,
    send: async (path, asked) => askOver(folder.paths.socket, path, asked),
    signal: (name) => {
      child.kill(name);
    },
    exitCode,
    errors: errors.whole,
    log: () => errors.soFar(),
    close: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      await exitCode;
      folder.remove();
    },
  };
}
