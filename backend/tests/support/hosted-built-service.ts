import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type BuiltService,
  startBuiltService,
} from '#tests/support/built-service';
import {
  imageCalls,
  type PlayedRun,
  playedRuns,
  playingEngine,
} from '#tests/support/playing-engine';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';

/** Where git is found on a desk and in CI, after the folder of `gh`. */
const SEARCH_PATH = '/usr/bin:/bin';

/** The script may be run by its owner, and read and run by the others. */
const RUNNABLE = 0o755;

/** A worker that looks for work often, so a test waits little. */
const QUICK_POLL_MS = '20';

/**
 * The built service as a process of its own over a code host in a
 * temporary folder. Every tool it starts is a stand-in it finds through
 * its environment, as it would find the real one: `gh` on the path, git
 * configured by the home, and the engine named by its variable. Nothing
 * reaches the network or a container.
 */
export interface HostedBuiltService {
  readonly host: TemporaryCodeHost;
  readonly service: BuiltService;
  /** Every container the engine was asked to run, in order. */
  playedRuns(): PlayedRun[];
  /** The arguments of every call of the engine about an image, in order. */
  imageCalls(): string[][];
  /** Stops the service, and removes its instance and the host. */
  close(): Promise<void>;
}

/** A script named `name` in `folder` that runs `command` with its arguments. */
function programOnThePath(
  folder: string,
  name: string,
  command: readonly string[],
): void {
  const quoted = command.map((part) => `'${part}'`).join(' ');
  writeFileSync(join(folder, name), `#!/bin/sh\nexec ${quoted} "$@"\n`, {
    mode: RUNNABLE,
  });
}

/**
 * The service gives git only its path and its home, and git on the mirror
 * and on a push reads the configuration of the home. So the settings the
 * host gives git in its environment, the rewrite of its addresses among
 * them, are written as the configuration of a home.
 */
function homeOf(host: TemporaryCodeHost): string {
  const home = join(host.folder, 'home');
  mkdirSync(home);
  const variables = host.settings.git.environment;
  const count = Number(variables['GIT_CONFIG_COUNT'] ?? '0');
  for (let index = 0; index < count; index += 1) {
    host.git(
      home,
      'config',
      `--file=${join(home, '.gitconfig')}`,
      variables[`GIT_CONFIG_KEY_${String(index)}`] ?? '',
      variables[`GIT_CONFIG_VALUE_${String(index)}`] ?? '',
    );
  }
  return home;
}

/**
 * Makes the stand-ins in the folder of the host, and gives the variables
 * that lead the service to them. The service starts `gh` by its name, so
 * a script of that name comes first on the path.
 */
function standInVariables(
  host: TemporaryCodeHost,
  engineFolder: string,
): Record<string, string> {
  const bin = join(host.folder, 'bin');
  mkdirSync(bin);
  programOnThePath(bin, 'gh', host.gh.command);
  return {
    PATH: `${bin}:${SEARCH_PATH}`,
    HOME: homeOf(host),
    AUTOPILOT_SANDBOX_ENGINE: JSON.stringify(playingEngine(engineFolder)),
    AUTOPILOT_QUEUE_POLL_MS: QUICK_POLL_MS,
  };
}

/**
 * A code host in a temporary folder and the stand-ins beside it, which
 * every service started with `variables` uses, one after another.
 */
export interface StandInHost {
  readonly host: TemporaryCodeHost;
  /** What leads a service to the stand-ins of `gh`, git and the engine. */
  readonly variables: Readonly<Record<string, string>>;
  /** Where the stand-in of the engine keeps what it played. */
  readonly engineFolder: string;
  /** Removes the host, its stand-ins and what they kept. */
  remove(): void;
}

/** A new code host with its stand-ins, and nothing on it yet. */
export function standInHost(): StandInHost {
  const host = new TemporaryCodeHost();
  const engineFolder = join(host.folder, 'engine');
  try {
    mkdirSync(engineFolder);
    return {
      host,
      variables: standInVariables(host, engineFolder),
      engineFolder,
      remove: () => {
        host.remove();
      },
    };
  } catch (error) {
    host.remove();
    throw error;
  }
}

/**
 * Starts the built service over a new code host, with these variables
 * besides those that reach the stand-ins.
 */
export function hostedBuiltService(
  variables: Readonly<Record<string, string>>,
): HostedBuiltService {
  const standIns = standInHost();
  let service: BuiltService;
  try {
    service = startBuiltService({ ...standIns.variables, ...variables });
  } catch (error) {
    standIns.remove();
    throw error;
  }
  return {
    host: standIns.host,
    service,
    playedRuns: () => playedRuns(standIns.engineFolder),
    imageCalls: () => imageCalls(standIns.engineFolder),
    close: async () => {
      try {
        await service.close();
      } finally {
        standIns.remove();
      }
    },
  };
}
