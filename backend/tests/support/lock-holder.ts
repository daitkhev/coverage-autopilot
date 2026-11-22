import { type ChildProcess, spawn } from 'node:child_process';
import { argv, execPath, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import { InstanceLock } from '#infrastructure/database/instance-lock';

/** `argv` starts with Node and this file. */
const PATH_ARGUMENT = 2;

/** The longest wait a timer holds: the holder waits to be killed. */
const FOREVER_MS = 2_147_483_647;

/** Takes the lock, says how that went, and keeps it until it is killed. */
function hold(path: string): void {
  const taking = InstanceLock.take(path);
  stdout.write(taking.outcome);
  // The timer keeps the lock referenced as well as the process alive.
  setInterval(() => taking, FOREVER_MS);
}

/** What the holder wrote first, or nothing when it ended before a word. */
async function firstWordOf(holder: ChildProcess): Promise<string> {
  for await (const chunk of holder.stdout ?? []) {
    return String(chunk);
  }
  return '';
}

/**
 * A process of its own that holds the instance lock of `path`, given
 * once it took it. A test ends it, with `SIGKILL` when it plays a crash.
 */
export async function startLockHolder(path: string): Promise<ChildProcess> {
  const holder = spawn(execPath, [fileURLToPath(import.meta.url), path], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const word = await firstWordOf(holder);
  if (word !== 'taken') {
    holder.kill('SIGKILL');
    throw new Error(`The holder of ${path} said "${word}", not "taken".`);
  }
  return holder;
}

if (import.meta.main) {
  hold(argv[PATH_ARGUMENT] ?? '');
}
