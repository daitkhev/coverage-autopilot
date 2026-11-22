import { dirname } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { exchange } from '#api/socket-exchange';
import { runClient } from '#composition/client-process';
import { signalStandIn } from '#tests/support/signal-stand-in';
import {
  type ScriptedServer,
  startScriptedServer,
} from '#tests/support/socket-server';

/*
 * Every request of the client waits 30 seconds for its answer. Here it
 * waits 50 milliseconds, so the test sees the limit run out.
 */
vi.mock('#api/socket-exchange', async (importOriginal) => {
  const real = await importOriginal<{ exchange: typeof exchange }>();
  return {
    exchange: async (...[socket, sent]: Parameters<typeof exchange>) =>
      real.exchange(socket, sent, 50),
  };
});

const FAILED = 1;

/** A program that would say so if the client started it. */
const NOT_TO_START = ['/bin/sh', '-c', 'echo "started" >&2; exit 3'] as const;

describe('runClient', () => {
  let server: ScriptedServer;

  beforeEach(async () => {
    server = await startScriptedServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('when the service takes the health and never answers', () => {
    it('should say once how long it waited, start none, and fail', async () => {
      server.answerWith({ silent: 'before_the_answer' });
      const out: string[] = [];
      const err: string[] = [];

      const code = await runClient({
        argv: ['doctor'],
        environment: { AUTOPILOT_INSTANCE_DIR: dirname(server.socket) },
        service: NOT_TO_START,
        terminal: undefined,
        out: (line) => out.push(line),
        err: (line) => err.push(line),
        signals: signalStandIn(),
      });

      expect(code).toBe(FAILED);
      expect(out).toEqual([]);
      expect(err).toEqual([
        `The service on the socket ${server.socket} did not answer in 0.05 seconds.`,
      ]);
      expect(server.received.map(({ url }) => url)).toEqual(['/health']);
    });
  });
});
