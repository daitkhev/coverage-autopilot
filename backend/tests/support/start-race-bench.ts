import { expect, vi } from 'vitest';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import {
  type BuiltClient,
  startBuiltClient,
} from '#tests/support/built-client';
import {
  type BuiltService,
  builtServiceVariables,
  startBuiltService,
} from '#tests/support/built-service';
import {
  createInstanceFolder,
  type InstanceFolder,
} from '#tests/support/instance-folder';
import { servicesOf, signalEach } from '#tests/support/instance-services';

/**
 * A process that was killed is gone in a moment, and in seconds on a
 * machine that runs several gates at once. `ps` takes a while itself, so
 * it is not asked more often than this.
 */
export const PROCESS_WAIT = { timeout: 60_000, interval: 200 };

/** Instances of their own, and every process a test starts on them. */
export interface StartRaceBench {
  /** A new instance folder, which `close` removes. */
  instance(): InstancePaths;
  /** Processes of the built service on the instance, started at once. */
  startServices(paths: InstancePaths, count: number): BuiltService[];
  /** Runs of the built client on the instance, started at once. */
  startClients(
    paths: InstancePaths,
    line: readonly string[],
    count: number,
  ): BuiltClient[];
  /**
   * Ends every client and every service of the instances, also those the
   * clients started, which are detached from the test, and removes the
   * folders, whatever the test left.
   */
  close(): Promise<void>;
}

/** Kills every service of the folder and waits until none is left. */
async function endServicesOf(folder: InstanceFolder): Promise<void> {
  const { directory } = folder.paths;
  signalEach(servicesOf(directory), 'SIGKILL');
  await vi.waitFor(() => {
    expect(servicesOf(directory)).toEqual([]);
  }, PROCESS_WAIT);
}

/** Ends what each test started on instances of its own. */
export function startRaceBench(): StartRaceBench {
  const folders: InstanceFolder[] = [];
  const services: BuiltService[] = [];
  const clients: BuiltClient[] = [];
  const many = <Started>(count: number, start: () => Started): Started[] =>
    Array.from({ length: count }, start);
  return {
    instance: () => {
      const folder = createInstanceFolder();
      folders.push(folder);
      return folder.paths;
    },
    startServices: (paths, count) => {
      const variables = builtServiceVariables(paths.directory);
      const started = many(count, () => startBuiltService(variables));
      services.push(...started);
      return started;
    },
    startClients: (paths, line, count) => {
      const variables = builtServiceVariables(paths.directory);
      const started = many(count, () => startBuiltClient(variables, line));
      clients.push(...started);
      return started;
    },
    close: async () => {
      clients.splice(0).forEach((client) => {
        client.kill();
      });
      await Promise.all(services.splice(0).map(async (one) => one.close()));
      const ended = folders.splice(0);
      const ends = await Promise.allSettled(ended.map(endServicesOf));
      ended.forEach((folder) => {
        folder.remove();
      });
      const failed = ends.find((end) => end.status === 'rejected');
      if (failed !== undefined) {
        throw failed.reason;
      }
    },
  };
}
