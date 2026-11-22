import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { argv, execPath, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import { InstanceLock } from '#infrastructure/database/instance-lock';

/** `argv` starts with Node and this file, then the lock and the socket. */
const LOCK_ARGUMENT = 2;
const SOCKET_ARGUMENT = 3;

/** The longest wait a timer holds: the holder waits to be killed. */
const FOREVER_MS = 2_147_483_647;

/**
 * Takes the lock and, when it got it and a socket is named, listens on
 * it. Then it says how the lock went and keeps both until it is killed.
 */
async function hold(lock: string, socket: string | undefined): Promise<void> {
  const taking = InstanceLock.take(lock);
  if (taking.outcome === 'taken' && socket !== undefined) {
    await once(createServer().listen(socket), 'listening');
  }
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
 * A process of its own that holds the instance lock of `lock`, given once
 * it took it. With a `socket`, it also listens there, as a service does.
 * A test ends it, with `SIGKILL` when it plays a crash.
 */
export async function startLockHolder(
  lock: string,
  socket?: string,
): Promise<ChildProcess> {
  const program = [fileURLToPath(import.meta.url), lock];
  const holder = spawn(
    execPath,
    socket === undefined ? program : [...program, socket],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const word = await firstWordOf(holder);
  if (word !== 'taken') {
    holder.kill('SIGKILL');
    throw new Error(`The holder of ${lock} said "${word}", not "taken".`);
  }
  return holder;
}

/** Kills the holder as a crash would, and waits until it is gone. */
export async function crash(holder: ChildProcess): Promise<void> {
  const exited = once(holder, 'exit');
  holder.kill('SIGKILL');
  await exited;
}

if (import.meta.main) {
  await hold(argv[LOCK_ARGUMENT] ?? '', argv[SOCKET_ARGUMENT]);
}
