import { chmodSync, lstatSync, unlinkSync } from 'node:fs';

import type { InstanceLock } from '#infrastructure/database/instance-lock';
import { SocketPathTakenError } from '#infrastructure/service/errors/socket-path-taken.error';

/** Read and written by its owner, and by no one else. */
const OWNER_ONLY = 0o600;

/**
 * Removes the socket file a crashed service left, before the service
 * listens. It takes the held lock, since only its holder may: when every
 * starting service removed the file it found, each removed the socket of
 * the one before and listened where no client reached it. A path that
 * holds anything else is refused, since no service made it.
 */
export function removeStaleSocket(lock: InstanceLock, path: string): void {
  lock.confirmHeld();
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry === undefined) {
    return;
  }
  if (!entry.isSocket()) {
    throw new SocketPathTakenError(
      `${path} is where the service listens, and it holds something that ` +
        'is not a socket. The service leaves it there: move it away and ' +
        'start again.',
    );
  }
  unlinkSync(path);
}

/**
 * Keeps the socket to its owner, once the service listens on it. The
 * directory keeps others out as well, but a person may open it to share
 * what it holds, and the socket would then let them drive the service.
 */
export function restrictSocket(lock: InstanceLock, path: string): void {
  lock.confirmHeld();
  chmodSync(path, OWNER_ONLY);
}
