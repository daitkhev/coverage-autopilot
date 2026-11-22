import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';
import { type Scan, scanSchema } from '@coverage-autopilot/api-contracts/scans';

import type { ServiceConfig } from '#infrastructure/config/service-config';
import type { SandboxEngine } from '#infrastructure/sandbox/sandbox-settings';
import { lockfileOf } from '#tests/support/project-folder';
import {
  askOver,
  type ServiceBench,
  serviceBench,
} from '#tests/support/service-bench';
import {
  callsIn,
  type EngineCall,
  type EnginePlay,
  standInEngine,
} from '#tests/support/stand-in-engine';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';

/** Where git is found on a desk and in CI, after the folder of `gh`. */
const SEARCH_PATH = '/usr/bin:/bin';

/** The script may be run by its owner, and read and run by the others. */
const RUNNABLE = 0o755;

/** A project of a test runner the service supports, with one source file. */
const PROJECT = {
  'package.json': JSON.stringify({
    name: 'widgets',
    devDependencies: { jest: '^30.5.2' },
  }),
  'package-lock.json': lockfileOf({ jest: '30.5.2' }),
  'src/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n',
};

/** A worker that looks for work often, so a test waits little. */
const QUICK_POLL = { AUTOPILOT_QUEUE_POLL_MS: '20' };

/**
 * How long a test waits for the worker, and how often it looks. Under the
 * load of a whole gate a scan takes seconds, though it takes a fraction of
 * one alone.
 */
export const WORK_WAIT = { timeout: 15_000, interval: 50 };

type Answer = Awaited<ReturnType<typeof askOver>>;

/**
 * A whole service in this process that reaches a code host in a temporary
 * folder, and runs each command of a sandbox through the stand-in of the
 * container engine. Nothing reaches the network or a container.
 */
export interface HostedService {
  readonly bench: ServiceBench;
  readonly host: TemporaryCodeHost;
  /** Sends a request over the socket of the service, as a client does. */
  send(path: string, asked?: Parameters<typeof askOver>[2]): Promise<Answer>;
  /** Every start of the engine, in order. */
  engineCalls(): EngineCall[];
  close(): Promise<void>;
}

/**
 * The service starts `gh` by its name, so a script of that name on the
 * path starts the stand-in of the code host.
 */
function ghOnThePath(host: TemporaryCodeHost): string {
  const folder = join(host.folder, 'bin');
  mkdirSync(folder);
  const command = host.gh.command.map((part) => `'${part}'`).join(' ');
  const script = join(folder, 'gh');
  writeFileSync(script, `#!/bin/sh\nexec ${command} "$@"\n`);
  chmodSync(script, RUNNABLE);
  return folder;
}

/** What the configuration of a hosted service is changed for. */
interface Stand {
  readonly host: TemporaryCodeHost;
  readonly engine: SandboxEngine;
}

/** The configuration with both of its sandboxes on `engine`. */
export function onEngine(
  config: ServiceConfig,
  engine: SandboxEngine,
): ServiceConfig {
  return {
    ...config,
    sandbox: { ...config.sandbox, engine },
    generator: {
      ...config.generator,
      sandbox: { ...config.generator.sandbox, engine },
    },
  };
}

function hostedConfig(config: ServiceConfig, stand: Stand): ServiceConfig {
  const { host, engine } = stand;
  const ghPath = `${ghOnThePath(host)}:${SEARCH_PATH}`;
  return {
    ...onEngine(config, engine),
    git: { ...config.git, environment: host.settings.git.environment },
    gh: {
      ...config.gh,
      environment: { ...host.settings.gh.environment, PATH: ghPath },
    },
  };
}

/** A service over a new code host, whose engine plays `play` on a run. */
export function hostedService(play: EnginePlay): HostedService {
  const host = new TemporaryCodeHost();
  host.gh.answer({});
  const record = join(host.folder, 'engine.jsonl');
  const engine = standInEngine(record, play);
  const bench = serviceBench(QUICK_POLL, (config) =>
    hostedConfig(config, { host, engine }),
  );
  return {
    bench,
    host,
    send: async (path, asked) =>
      askOver(bench.config.instance.socket, path, asked),
    engineCalls: () => callsIn(record),
    close: async () => {
      await bench.close();
      host.remove();
    },
  };
}

/**
 * Connects `acme/widgets`, a project of a supported test runner, to the
 * running service and asks for its scan over the socket, as the client
 * does. Gives the scan as the service first answered it.
 */
export async function askedScan(hosted: HostedService): Promise<Scan> {
  hosted.host.createRepository('acme/widgets', PROJECT);
  const connected = await hosted.send('/repositories', {
    method: 'POST',
    body: { url: TemporaryCodeHost.urlOf('acme/widgets') },
  });
  const { id } = repositorySchema.parse(connected.body);
  const asked = await hosted.send(`/repositories/${id}/scans`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'scan-1' },
  });
  return scanSchema.parse(asked.body);
}
