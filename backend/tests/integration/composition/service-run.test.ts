import { once } from 'node:events';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { Agent, type IncomingMessage, request as httpRequest } from 'node:http';
import { connect, type Socket } from 'node:net';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';

import type { ServiceRun } from '#composition/service-run';
import { InvalidMigrationFileError } from '#infrastructure/database/errors/invalid-migration-file.error';
import type { RunningService } from '#infrastructure/service/running-service';
import { SystemClock } from '#infrastructure/time/system-clock.adapter';
import {
  askOver,
  type ServiceBench,
  serviceBench,
} from '#tests/support/service-bench';
import { MIGRATIONS_FOLDER } from '#tests/support/temporary-database';

/** The bits of a mode that say who may read, write and enter. */
const PERMISSIONS = 0o777;

let bench: ServiceBench;

function running(run: ServiceRun): RunningService {
  if (run.outcome !== 'running') {
    throw new Error(`The service did not run: ${run.outcome}.`);
  }
  return run.service;
}

async function started(): Promise<RunningService> {
  return running(await bench.run());
}

/**
 * A request whose body never comes. The server of a service waits for
 * its open requests as it closes, so the stop of that service is held
 * after its socket is gone and before it gives back its lock. The server
 * answers `100 Continue` once it read the head, so the request is open.
 */
async function requestInFlight(socket: string): Promise<Socket> {
  const client = connect(socket);
  await once(client, 'connect');
  client.write(
    'POST /repositories HTTP/1.1\r\nHost: service\r\n' +
      'Content-Type: application/json\r\nContent-Length: 2\r\n' +
      'Expect: 100-continue\r\n\r\n',
  );
  await once(client, 'data');
  return client;
}

/**
 * A request over the one connection of `agent`, whose head is sent and
 * read, and whose body waits until the function it gives is called.
 */
async function heldRequest(
  agent: Agent,
  socket: string,
): Promise<() => Promise<IncomingMessage>> {
  const request = httpRequest({
    agent,
    socketPath: socket,
    method: 'POST',
    path: '/repositories',
    headers: { 'content-type': 'application/json', expect: '100-continue' },
  });
  const answered = once(request, 'response');
  await once(request, 'continue');
  return async () => {
    request.end('{}');
    const [answer] = (await answered) as [IncomingMessage];
    answer.resume();
    await once(answer, 'end');
    return answer;
  };
}

async function askedOver(
  agent: Agent,
  socket: string,
): Promise<IncomingMessage> {
  const request = httpRequest({ agent, socketPath: socket, path: '/health' });
  const answered = once(request, 'response');
  request.end();
  const [answer] = (await answered) as [IncomingMessage];
  answer.resume();
  await once(answer, 'end');
  return answer;
}

/**
 * What a test left open, ended before its bench closes, also when the
 * test failed half way.
 */
let leftOpen: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const end of leftOpen) {
    await end();
  }
  leftOpen = [];
  await bench.close();
});

describe('runService', () => {
  it('should listen on the socket of its instance, kept to its owner', async () => {
    bench = serviceBench();
    await started();

    const { socket, directory } = bench.config.instance;
    expect(statSync(socket).isSocket()).toBe(true);
    expect(statSync(socket).mode & PERMISSIONS).toBe(0o600);
    expect(statSync(directory).mode & PERMISSIONS).toBe(0o700);
  });

  it('should answer a path no route has in the shape of the contract', async () => {
    bench = serviceBench();
    await started();

    const answer = await askOver(bench.config.instance.socket, '/nowhere');

    expect(answer.status).toBe(404);
    expect(errorSchema.parse(answer.body).error).toBe('not_found');
  });

  it('should hold its instance against a second service', async () => {
    bench = serviceBench();
    await started();
    const paused: number[] = [];
    const second = await bench.run(MIGRATIONS_FOLDER, async (ms) => {
      paused.push(ms);
      return Promise.resolve();
    });

    const answer = await askOver(bench.config.instance.socket, '/nowhere');

    expect(second).toEqual({ outcome: 'held_by_another' });
    expect(paused).toEqual([]);
    expect(answer.status).toBe(404);
    expect(bench.lockIsFree()).toBe(false);
  });

  describe('when it starts while another one is on its way out', () => {
    it('should wait for the lock the other gives back, and serve', async () => {
      bench = serviceBench();
      const first = await started();
      const { socket } = bench.config.instance;
      const request = await requestInFlight(socket);
      leftOpen.push(async () => Promise.resolve(request.destroy()));
      const stopping = first.stop();
      await vi.waitFor(() => {
        expect(existsSync(socket)).toBe(false);
      });
      expect(bench.lockIsFree()).toBe(false);
      const waits = Promise.withResolvers<undefined>();
      const goOn = Promise.withResolvers<undefined>();
      const second = bench.run(MIGRATIONS_FOLDER, async () => {
        waits.resolve(undefined);
        await goOn.promise;
      });
      leftOpen.push(async () => {
        goOn.resolve(undefined);
        return Promise.allSettled([second]);
      });

      await Promise.race([waits.promise, second]);
      request.destroy();
      await stopping;
      goOn.resolve(undefined);
      const run = running(await second);

      expect(statSync(socket).isSocket()).toBe(true);
      expect((await askOver(socket, '/health')).status).toBe(200);
      expect(run.startedAt.isBefore(first.startedAt)).toBe(false);
    });
  });

  it('should tell when it began to answer', async () => {
    bench = serviceBench();
    const clock = new SystemClock();
    const before = clock.now();

    const service = await started();

    expect(service.startedAt.isBefore(before)).toBe(false);
    expect(clock.now().isBefore(service.startedAt)).toBe(false);
  });

  describe('when it stops', () => {
    it('should leave no socket and give the lock to the next service', async () => {
      bench = serviceBench();
      const first = await started();

      await first.stop();

      expect(existsSync(bench.config.instance.socket)).toBe(false);
      expect(bench.lockIsFree()).toBe(true);
      const third = await started();
      const answer = await askOver(bench.config.instance.socket, '/nowhere');
      expect(answer.status).toBe(404);
      await third.stop();
    });

    it('should close a connection a client goes on asking over, and end', async () => {
      bench = serviceBench();
      const service = await started();
      const { socket } = bench.config.instance;
      const agent = new Agent({ keepAlive: true, maxSockets: 1 });
      leftOpen.push(async () => {
        agent.destroy();
        return Promise.resolve();
      });
      const answerHeld = await heldRequest(agent, socket);
      const stopping = service.stop();
      await vi.waitFor(() => {
        expect(existsSync(socket)).toBe(false);
      });

      const held = await answerHeld();
      const again = await askedOver(agent, socket);

      expect(held.headers.connection).toBe('keep-alive');
      expect(again.headers.connection).toBe('close');
      await expect(stopping).resolves.toBeUndefined();
    });

    it('should stop once, however often it is asked', async () => {
      bench = serviceBench();
      const service = await started();

      const asked = [service.stop(), service.stop()];
      await Promise.all(asked);

      expect(asked[0]).toBe(asked[1]);
      await expect(service.stopped).resolves.toBeUndefined();
    });
  });

  describe('when a start fails after it took the lock', () => {
    it('should give back the lock and the database, and listen nowhere', async () => {
      bench = serviceBench();
      const { directory } = bench.config.instance;
      const migrations = join(dirname(directory), 'migrations');
      mkdirSync(migrations);
      writeFileSync(join(migrations, 'first.sql'), 'CREATE TABLE a (b);');

      await expect(bench.run(migrations)).rejects.toThrow(
        InvalidMigrationFileError,
      );

      expect(bench.lockIsFree()).toBe(true);
      expect(existsSync(bench.config.instance.socket)).toBe(false);
      expect(existsSync(`${bench.config.instance.database}-wal`)).toBe(false);
    });

    it('should refuse a folder of migrations that is empty', async () => {
      bench = serviceBench();
      const migrations = join(dirname(bench.config.instance.directory), 'none');
      mkdirSync(migrations);

      await expect(bench.run(migrations)).rejects.toThrow(
        new InvalidMigrationFileError(
          `${migrations} holds no migration. The versions start at 1.`,
        ),
      );
      expect(bench.lockIsFree()).toBe(true);
    });
  });

  describe('when the generator has no credential', () => {
    it('should start, and say which variable it lacks', async () => {
      bench = serviceBench();
      await started();

      expect(bench.logLines()).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          fields: {
            variable: 'CLAUDE_CODE_OAUTH_TOKEN',
            billing: 'subscription',
          },
        }),
      );
    });
  });

  describe('when the generator has a credential', () => {
    it('should say nothing of it', async () => {
      bench = serviceBench({ CLAUDE_CODE_OAUTH_TOKEN: 'zz-private' });
      await started();

      expect(bench.logLines()).toEqual([]);
    });
  });
});
