import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  closeSync,
  createReadStream,
  mkdirSync,
  openSync,
  statSync,
} from 'node:fs';
import { text } from 'node:stream/consumers';

import type { InstanceLocation } from '#api/instance-location';
import { lastLinesOf } from '#api/last-lines';
import { pollUntil, type Waiting } from '#api/polling';

/** The program and its arguments, such as `[execPath, serviceEntry]`. */
export type ServiceCommand = readonly [string, ...string[]];

/** What a service is started with. */
export interface LaunchRequest {
  readonly location: InstanceLocation;
  readonly command: ServiceCommand;
  /**
   * Exactly the variables the service gets, and nothing of the client's
   * own. The instance directory is added, so the service listens where
   * the client looks.
   */
  readonly variables: Readonly<Record<string, string>>;
}

/** A service process this client started. */
export interface LaunchedService {
  /**
   * Whether the process ended in a way no other service explains. A
   * service that finds another holding its instance leaves with 0, and
   * that other one may still be on its way to answer.
   */
  failed(): boolean;
  /** The last lines the process wrote to the log. */
  lines(): Promise<string[]>;
  /** Ends a process that still runs: asked first, killed after the wait. */
  end(waiting: Waiting): Promise<void>;
}

/**
 * The instance directory and its log are the user's alone, as the service
 * keeps them.
 */
const OWNER_ONLY_FOLDER = 0o700;
const OWNER_ONLY_FILE = 0o600;

/** The code of a service that left because another holds its instance. */
const LEFT_FOR_ANOTHER = 0;

/** The bytes in the log so far, or none when there is no log yet. */
export function logSizeOf(log: string): number {
  return statSync(log, { throwIfNoEntry: false })?.size ?? 0;
}

/** The last lines written to the log after it held `offset` bytes. */
export async function linesSince(
  log: string,
  offset: number,
): Promise<string[]> {
  if (logSizeOf(log) <= offset) {
    return [];
  }
  return lastLinesOf(await text(createReadStream(log, { start: offset })));
}

function hasEnded(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function endProcess(
  child: ChildProcess,
  waiting: Waiting,
): Promise<void> {
  if (hasEnded(child)) {
    return;
  }
  const exited = once(child, 'exit');
  // The client waits for this process now, so the process holds it open.
  child.ref();
  child.kill('SIGTERM');
  if (!(await pollUntil(waiting, () => hasEnded(child)))) {
    child.kill('SIGKILL');
  }
  await exited;
}

/**
 * A process of its own group, so it outlives the terminal of the client,
 * which does not wait for it either.
 */
async function spawned(
  request: LaunchRequest,
  log: number,
): Promise<ChildProcess> {
  const [program, ...rest] = request.command;
  const child = spawn(program, rest, {
    detached: true,
    env: {
      ...request.variables,
      AUTOPILOT_INSTANCE_DIR: request.location.directory,
    },
    stdio: ['ignore', 'ignore', log],
  });
  await once(child, 'spawn');
  child.unref();
  return child;
}

/**
 * Starts the service with its standard error appended to the log in its
 * instance directory, which is made for it when it is missing. A program
 * that cannot be started at all is a fault.
 */
export async function launchService(
  request: LaunchRequest,
): Promise<LaunchedService> {
  const { directory, log } = request.location;
  mkdirSync(directory, { recursive: true, mode: OWNER_ONLY_FOLDER });
  const offset = logSizeOf(log);
  const descriptor = openSync(log, 'a', OWNER_ONLY_FILE);
  try {
    const child = await spawned(request, descriptor);
    return {
      failed: () => hasEnded(child) && child.exitCode !== LEFT_FOR_ANOTHER,
      lines: async () => linesSince(log, offset),
      end: async (waiting) => endProcess(child, waiting),
    };
  } finally {
    closeSync(descriptor);
  }
}
