import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { execPath } from 'node:process';
import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { createInstanceFolder } from '#tests/support/instance-folder';
import { askOver } from '#tests/support/service-bench';

/** The service as the gate builds it, beside the migrations it reads. */
const BUILT_FILE = fileURLToPath(
  new URL('../../dist/main.js', import.meta.url),
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
  /** Ends a process that still runs, and removes the instance it made. */
  close(): Promise<void>;
}

async function exitCodeOf(child: ChildProcess): Promise<number | null> {
  const [code] = (await once(child, 'exit')) as [number | null];
  return code;
}

/**
 * Starts the built file under plain Node. The process gets exactly these
 * variables and nothing of the test process: a path to find git, a home
 * of its own, its instance folder, and what a test adds. A test that
 * names the instance of another service shares that instance.
 */
export function startBuiltService(
  variables: Readonly<Record<string, string>> = {},
): BuiltService {
  const folder = createInstanceFolder();
  const own = {
    PATH: SEARCH_PATH,
    HOME: dirname(folder.paths.directory),
    AUTOPILOT_INSTANCE_DIR: folder.paths.directory,
    ...variables,
  };
  const child = spawn(execPath, [BUILT_FILE], {
    env: own,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exitCode = exitCodeOf(child);
  return {
    paths: folder.paths,
    send: async (path, asked) => askOver(folder.paths.socket, path, asked),
    signal: (name) => {
      child.kill(name);
    },
    exitCode,
    errors: text(child.stderr),
    close: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      await exitCode;
      folder.remove();
    },
  };
}
