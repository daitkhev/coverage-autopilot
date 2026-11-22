import type { Writable } from 'node:stream';

import { runService } from '#composition/service-run';
import type { Environment } from '#infrastructure/config/environment-values';
import {
  loadServiceConfig,
  type ProcessUser,
} from '#infrastructure/config/service-config';
import type { RunningService } from '#infrastructure/service/running-service';

/** What the entry file reads of its process and gives on as values. */
export interface ServiceProcess {
  readonly environment: Environment;
  readonly user: ProcessUser;
  /** Found from the place of the entry file, which a bundle moves. */
  readonly migrationsFolder: string;
  /** The version of the package, read beside the entry file. */
  readonly version: string;
  /** The standard error: the lines of the log, and that of a failure. */
  readonly errors: Writable;
  /** Calls `stop` when the process is asked to stop, such as on a signal. */
  readonly onStopRequest: (stop: () => void) => void;
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
    const config = loadServiceConfig(entry.environment, entry.user);
    const run = await runService(config, {
      migrationsFolder: entry.migrationsFolder,
      logStream: entry.errors,
      version: entry.version,
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
  entry.onStopRequest(() => {
    void service.stop();
  });
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
