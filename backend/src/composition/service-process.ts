import { readFileSync } from 'node:fs';
import type { Writable } from 'node:stream';

import { runService } from '#composition/service-run';
import type { Environment } from '#infrastructure/config/environment-values';
import { loadServiceConfig } from '#infrastructure/config/service-config';
import type { RunningService } from '#infrastructure/service/running-service';

/** A second signal finds no listener and ends the process at once. */
const STOP_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** Where the signals of a process arrive. */
interface SignalSource {
  once(signal: (typeof STOP_SIGNALS)[number], listener: () => void): unknown;
}

/** What the entry file reads of its process and gives on as values. */
export interface ServiceProcess {
  readonly environment: Environment;
  /** The ids of the user of the process. Some systems have none. */
  readonly user: {
    readonly uid: number | undefined;
    readonly gid: number | undefined;
  };
  /** Found from the place of the entry file, which a bundle moves. */
  readonly migrationsFolder: string;
  /** The package of the service, found the same way. */
  readonly packageFile: string;
  /** The standard error: the lines of the log, and that of a failure. */
  readonly errors: Writable;
  readonly signals: SignalSource;
}

/** No id of a user, with which the configuration refuses to start. */
const NO_ID = -1;

/** The version of the package, which `GET /health` reports. */
function versionIn(packageFile: string): string {
  const text = readFileSync(packageFile, 'utf8');
  const { version } = JSON.parse(text) as { readonly version: string };
  return version;
}

/**
 * A clean stop, or another service of the instance. A client starts a
 * service whenever none answers, so the one that came second leaves as
 * if nothing happened.
 */
const EXIT_WELL = 0;
const EXIT_FAILED = 1;

/** A person reads it, so it is one line with no stack. */
function failureLine(what: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `The service ${what}: ${message.replaceAll(/\s*\n\s*/gu, ' ')}\n`;
}

/** The running service, or the code to exit with at once. */
async function started(
  entry: ServiceProcess,
): Promise<RunningService | number> {
  try {
    const config = loadServiceConfig(entry.environment, {
      uid: entry.user.uid ?? NO_ID,
      gid: entry.user.gid ?? NO_ID,
    });
    const run = await runService(config, {
      migrationsFolder: entry.migrationsFolder,
      logStream: entry.errors,
      version: versionIn(entry.packageFile),
    });
    return run.outcome === 'running' ? run.service : EXIT_WELL;
  } catch (error) {
    entry.errors.write(failureLine('did not start', error));
    return EXIT_FAILED;
  }
}

async function untilStopped(
  service: RunningService,
  entry: ServiceProcess,
): Promise<number> {
  for (const signal of STOP_SIGNALS) {
    entry.signals.once(signal, () => {
      void service.stop();
    });
  }
  try {
    await service.stopped;
    return EXIT_WELL;
  } catch (error) {
    entry.errors.write(failureLine('did not stop cleanly', error));
    return EXIT_FAILED;
  }
}

/**
 * Runs the service of the process until it is asked to stop, and gives
 * the code the process exits with. The entry file reads the process, and
 * every decision is here, where a test gives values.
 */
export async function serveProcess(entry: ServiceProcess): Promise<number> {
  const service = await started(entry);
  return typeof service === 'number' ? service : untilStopped(service, entry);
}
