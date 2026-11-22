import { type IncomingMessage, request } from 'node:http';
import { Writable } from 'node:stream';
import { json } from 'node:stream/consumers';

import type { ServiceConfig } from '#infrastructure/config/service-config';
import { InstanceLock } from '#infrastructure/database/instance-lock';
import { runService, type ServiceRun } from '#service/service-run';
import {
  createInstanceFolder,
  type InstanceFolder,
} from '#tests/support/instance-folder';
import { loadWith, PLAIN_MACHINE } from '#tests/support/service-variables';
import { MIGRATIONS_FOLDER } from '#tests/support/temporary-database';

/** The version a service of the bench reports. */
export const SERVICE_VERSION = '0.0.0-bench';

/** One line of the log, as the logger of the service writes it. */
interface LogLine {
  readonly level: string;
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/** The status and the body of an answer, read as JSON. */
interface SocketAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** A request a client sends. Left out, it is a `GET` with no body. */
interface Asked {
  readonly method?: 'GET' | 'POST';
  /** Sent as JSON. */
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Services of one instance in a folder of their own, as a test runs them. */
export interface ServiceBench {
  readonly config: ServiceConfig;
  /** The variables the configuration was read from. */
  readonly environment: Readonly<Record<string, string>>;
  /** Where the services of the bench write their log. */
  readonly logStream: Writable;
  /** Everything written to that stream so far. */
  logText(): string;
  /** Every line of the log so far. */
  logLines(): LogLine[];
  /** Runs a service of the instance, which `close` stops if it still runs. */
  run(migrationsFolder?: string): Promise<ServiceRun>;
  /** Whether a service could take the lock now, which it then gives back. */
  lockIsFree(): boolean;
  /** Stops every service the bench ran and removes the folder. */
  close(): Promise<void>;
}

/** Asks the service on `socket` for `path`, as a client would. */
export async function askOver(
  socket: string,
  path: string,
  asked: Asked = {},
): Promise<SocketAnswer> {
  const payload =
    asked.body === undefined ? undefined : JSON.stringify(asked.body);
  const headers = {
    ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    ...asked.headers,
  };
  const method = asked.method ?? 'GET';
  const answer = await new Promise<IncomingMessage>((resolve, reject) => {
    request({ socketPath: socket, path, method, headers }, resolve)
      .on('error', reject)
      .end(payload);
  });
  return { status: answer.statusCode ?? 0, body: await json(answer) };
}

function collected(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write: (chunk: Buffer, _encoding, done) => {
      chunks.push(chunk.toString('utf8'));
      done();
    },
  });
  return { stream, text: () => chunks.join('') };
}

/**
 * A bench whose configuration has these variables besides the folder, and
 * whatever `change` makes of it, such as an engine that is no container.
 */
export function serviceBench(
  variables: Record<string, string> = {},
  change: (config: ServiceConfig) => ServiceConfig = (config) => config,
): ServiceBench {
  const instance: InstanceFolder = createInstanceFolder();
  const own = {
    AUTOPILOT_INSTANCE_DIR: instance.paths.directory,
    ...variables,
  };
  const config = change(loadWith(own));
  const log = collected();
  const runs: ServiceRun[] = [];
  return {
    config,
    environment: { ...PLAIN_MACHINE, ...own },
    logStream: log.stream,
    logText: log.text,
    logLines: () =>
      log
        .text()
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as LogLine),
    run: async (migrationsFolder = MIGRATIONS_FOLDER) => {
      const run = await runService(config, {
        migrationsFolder,
        logStream: log.stream,
        version: SERVICE_VERSION,
      });
      runs.push(run);
      return run;
    },
    lockIsFree: () => {
      const taking = InstanceLock.take(instance.paths.lock);
      if (taking.outcome === 'taken') {
        taking.lock.release();
      }
      return taking.outcome === 'taken';
    },
    close: async () => {
      for (const run of runs) {
        if (run.outcome === 'running') {
          await run.service.stop();
        }
      }
      instance.remove();
    },
  };
}
