import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { instanceLocationIn } from '#api/instance-location';
import type { ServiceApi } from '#api/service-api';
import { launchService } from '#api/service-launch';
import {
  answerAfterStart,
  type ReadyService,
  readyService,
  type ServiceDidNotStart,
  type ServiceStartOptions,
} from '#api/service-start';
import { isServiceUnreachable } from '#api/service-unreachable-error';

/** What a service of its own is started with. */
export interface IsolatedServiceOptions extends Omit<
  ServiceStartOptions,
  'location'
> {
  /**
   * The folder to make the instance in. The path of a socket is at most
   * 104 bytes, so it is a short one, such as `/tmp`, and not the long
   * temporary folder of macOS.
   */
  readonly temporaryRoot: string;
}

/** A service of its own that answers, and the one way to end it. */
interface IsolatedReadyService extends ReadyService {
  /**
   * Itself while it answers. A service that stopped, as one asked to
   * restart does, is started again in the same folder, so the socket a
   * client holds leads to the new one.
   */
  again(observe: ServiceStartOptions['observe']): Promise<IsolatedService>;
  /**
   * Ends the service, the one process this client started, and removes
   * its folder.
   */
  stop(): Promise<void>;
}

/**
 * A service that did not start was ended, and its folder is kept, so the
 * path of its log still leads somewhere.
 */
export type IsolatedService = IsolatedReadyService | ServiceDidNotStart;

const FOLDER_PREFIX = 'coverage-autopilot-';

function remove(folder: string): void {
  rmSync(folder, { recursive: true, force: true });
}

async function answers(api: ServiceApi): Promise<boolean> {
  try {
    await api.health();
    return true;
  } catch (error) {
    if (isServiceUnreachable(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Starts the service in the folder, and ends it again on a fault. No
 * other client knows the folder, so what answers there is the process
 * this one started, of its own package.
 */
async function startedIn(
  folder: string,
  options: IsolatedServiceOptions,
): Promise<IsolatedService> {
  const own = { ...options, location: instanceLocationIn(folder) };
  options.observe('starting');
  const launched = await launchService(own);
  try {
    const answer = await answerAfterStart(own, launched);
    if (answer.outcome === 'did_not_start') {
      await launched.end(options);
      return answer;
    }
    const ready = readyService(own.location.socket, answer.reply);
    const service: IsolatedReadyService = {
      ...ready,
      again: async (observe) => {
        if (await answers(ready.api)) {
          return service;
        }
        await launched.end(options);
        return startedIn(folder, { ...options, observe });
      },
      stop: async () => {
        await launched.end(options);
        remove(folder);
      },
    };
    return service;
  } catch (error) {
    await launched.end(options);
    throw error;
  }
}

/**
 * Starts a service of its own in a new instance directory, for a command
 * that must not touch the service of the user. A fault ends what was
 * started and removes the folder before it is thrown.
 */
export async function startIsolatedService(
  options: IsolatedServiceOptions,
): Promise<IsolatedService> {
  const folder = mkdtempSync(join(options.temporaryRoot, FOLDER_PREFIX));
  try {
    return await startedIn(folder, options);
  } catch (error) {
    remove(folder);
    throw error;
  }
}
