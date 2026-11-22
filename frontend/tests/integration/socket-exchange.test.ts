import { once } from 'node:events';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getRequest, postRequest } from '#api/route-requests';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { exchange } from '#api/socket-exchange';
import {
  type ScriptedServer,
  startScriptedServer,
} from '#tests/support/socket-server';

const HEALTH = getRequest('/health');

/** The failure the client gives when nothing answers, with its cause. */
async function unreachableOf(socket: string): Promise<ServiceUnreachableError> {
  const failure: unknown = await exchange(socket, HEALTH).catch(
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(ServiceUnreachableError);
  return failure as ServiceUnreachableError;
}

function codeOf(error: Error): unknown {
  return (error.cause as NodeJS.ErrnoException | undefined)?.code;
}

describe('exchange', () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync('/tmp/exchange-');
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  describe('when no file is at the path', () => {
    it('should say that nothing answers on the socket, with the cause', async () => {
      const socket = join(folder, 'service.sock');

      const failure = await unreachableOf(socket);

      expect(failure.socketPath).toBe(socket);
      expect(codeOf(failure)).toBe('ENOENT');
    });
  });

  describe('when the path holds a file that is no socket', () => {
    it('should say that nothing answers on the socket', async () => {
      const socket = join(folder, 'service.sock');
      writeFileSync(socket, 'not a socket');

      expect(codeOf(await unreachableOf(socket))).toBe('ENOTSOCK');
    });
  });

  describe('when no process listens on the socket any more', () => {
    it('should say that nothing answers on the socket', async () => {
      const listened = join(folder, 'listened.sock');
      const socket = join(folder, 'service.sock');
      const server = createServer().listen(listened);
      await once(server, 'listening');
      // A crashed service leaves its socket: closing the server cannot
      // remove the file once it has another name.
      renameSync(listened, socket);
      server.close();
      await once(server, 'close');

      expect(codeOf(await unreachableOf(socket))).toBe('ECONNREFUSED');
    });
  });

  describe('when the service answers', () => {
    let server: ScriptedServer;

    beforeEach(async () => {
      server = await startScriptedServer();
    });

    afterEach(async () => {
      await server.close();
    });

    it('should give the status and the body as text', async () => {
      server.answerWith({ status: 202, text: '{"stopping":true}' });

      await expect(exchange(server.socket, HEALTH)).resolves.toEqual({
        status: 202,
        text: '{"stopping":true}',
      });
    });

    it('should send a body as JSON, with its length', async () => {
      server.answerWith({ status: 200, text: '' });

      await exchange(server.socket, postRequest('/x', { body: { a: 'é' } }));

      expect(server.received[0]?.body).toBe('{"a":"é"}');
      expect(server.received[0]?.headers['content-length']).toBe('10');
    });

    describe('when it cuts the connection before it answers', () => {
      it('should say that nothing answers on the socket', async () => {
        server.answerWith({ cut: 'before_the_answer' });

        expect(codeOf(await unreachableOf(server.socket))).toBe('ECONNRESET');
      });
    });

    describe('when it cuts the connection within its answer', () => {
      it('should say that nothing answers on the socket', async () => {
        server.answerWith({ cut: 'within_the_answer' });

        expect(codeOf(await unreachableOf(server.socket))).toBe('ECONNRESET');
      });
    });

    describe('when what answers does not speak HTTP', () => {
      it('should throw the failure as it came', async () => {
        server.answerWith({ raw: 'NOT HTTP\r\n\r\n' });

        await expect(exchange(server.socket, HEALTH)).rejects.toThrow(
          'Parse Error',
        );
      });
    });
  });
});
