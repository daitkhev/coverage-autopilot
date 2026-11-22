import { once } from 'node:events';
import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Server } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { InstanceLockReleasedError } from '#infrastructure/database/errors/instance-lock-released.error';
import { InstanceLock } from '#infrastructure/database/instance-lock';
import { SocketPathTakenError } from '#infrastructure/service/errors/socket-path-taken.error';
import { prepareInstanceDirectory } from '#infrastructure/service/instance-directory';
import {
  removeStaleSocket,
  restrictSocket,
} from '#infrastructure/service/service-socket';
import {
  createInstanceFolder,
  type InstanceFolder,
} from '#tests/support/instance-folder';
import { crash, startLockHolder } from '#tests/support/lock-holder';

const PERMISSIONS = 0o777;

let instance: InstanceFolder;
let paths: InstancePaths;
let locks: InstanceLock[];
let servers: Server[];

function heldLock(): InstanceLock {
  const taking = InstanceLock.take(paths.lock);
  if (taking.outcome !== 'taken') {
    throw new Error('Another holds the lock of the test.');
  }
  locks.push(taking.lock);
  return taking.lock;
}

async function listen(): Promise<Server> {
  const server = createServer((socket) => socket.end());
  await once(server.listen(paths.socket), 'listening');
  servers.push(server);
  return server;
}

async function reached(): Promise<boolean> {
  const client = connect(paths.socket);
  await once(client, 'connect');
  client.destroy();
  return true;
}

beforeEach(() => {
  instance = createInstanceFolder();
  paths = instance.paths;
  prepareInstanceDirectory(paths);
  locks = [];
  servers = [];
});

afterEach(() => {
  for (const server of servers) {
    server.close();
  }
  for (const lock of locks) {
    lock.release();
  }
  instance.remove();
});

describe('removeStaleSocket', () => {
  describe('when a killed service left its socket', () => {
    it('should remove it, so a new service can listen there', async () => {
      await crash(await startLockHolder(paths.lock, paths.socket));
      const lock = heldLock();
      await expect(listen()).rejects.toThrow('EADDRINUSE');

      removeStaleSocket(lock, paths.socket);
      await listen();

      expect(await reached()).toBe(true);
    });
  });

  it('should do nothing when there is no socket', () => {
    expect(() => {
      removeStaleSocket(heldLock(), paths.socket);
    }).not.toThrow();
  });

  describe('when the path holds something else', () => {
    it.each([
      [
        'a file',
        () => {
          writeFileSync(paths.socket, 'notes\n');
        },
      ],
      [
        'a folder',
        () => {
          mkdirSync(paths.socket);
        },
      ],
    ])('should throw SocketPathTakenError and keep %s', (_kind, place) => {
      place();

      expect(() => {
        removeStaleSocket(heldLock(), paths.socket);
      }).toThrow(
        new SocketPathTakenError(
          `${paths.socket} is where the service listens, and it holds ` +
            'something that is not a socket. The service leaves it there: ' +
            'move it away and start again.',
        ),
      );
      expect(lstatSync(paths.socket).isSocket()).toBe(false);
    });
  });

  describe('when the lock was released', () => {
    it('should throw InstanceLockReleasedError and keep the socket', async () => {
      await crash(await startLockHolder(paths.lock, paths.socket));
      const lock = heldLock();
      lock.release();

      expect(() => {
        removeStaleSocket(lock, paths.socket);
      }).toThrow(InstanceLockReleasedError);
      expect(lstatSync(paths.socket).isSocket()).toBe(true);
    });
  });
});

describe('restrictSocket', () => {
  it('should keep the socket of a listening service to its owner', async () => {
    const lock = heldLock();
    await listen();

    restrictSocket(lock, paths.socket);

    expect(lstatSync(paths.socket).mode & PERMISSIONS).toBe(0o600);
    expect(await reached()).toBe(true);
  });

  describe('when the lock was released', () => {
    it('should throw InstanceLockReleasedError', async () => {
      const lock = heldLock();
      await listen();
      lock.release();

      expect(() => {
        restrictSocket(lock, paths.socket);
      }).toThrow(InstanceLockReleasedError);
    });
  });
});
