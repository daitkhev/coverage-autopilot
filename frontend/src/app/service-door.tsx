import type { ClientSession } from '#api/client-session';
import { currentMoment, localTimeZone } from '#api/clock';
import {
  instanceLocationOf,
  type InstanceSetting,
} from '#api/instance-location';
import {
  type IsolatedService,
  startIsolatedService,
} from '#api/isolated-service';
import { pause } from '#api/pause';
import type { ServiceWait } from '#api/polling';
import type { ServiceApi } from '#api/service-api';
import type { ServiceCommand } from '#api/service-launch';
import { reachService } from '#api/service-reach';
import type { Reach } from '#app/client';

/** What the entry file read of the process, to find or start a service. */
export interface ServiceSetting {
  readonly instance: InstanceSetting;
  /** The program and the entry file of the service this client starts. */
  readonly command: ServiceCommand;
  /** The variables a started service gets. */
  readonly variables: Readonly<Record<string, string>>;
  /** Where a service of its own gets its folder: a short path. */
  readonly temporaryRoot: string;
}

/** The way to the service of one run of the client, and the way out. */
export interface ServiceDoor {
  readonly reach: Reach;
  /** Ends what this run started for itself alone. */
  readonly leave: () => Promise<void>;
  /** The one way the client waits. */
  readonly pause: (ms: number) => Promise<void>;
}

/** A start that takes longer than this is said to have failed. */
const WAIT: ServiceWait = { totalMs: 20_000, intervalMs: 100 };

/** The session of a run over a service that answers. */
export function sessionOf(api: ServiceApi): ClientSession {
  return { api, now: currentMoment, timeZone: localTimeZone() };
}

/** The service of the user: found, started, or replaced, and never stopped. */
function sharedDoor(setting: ServiceSetting): ServiceDoor {
  return {
    reach: async (observe) =>
      reachService({
        location: instanceLocationOf(setting.instance),
        command: setting.command,
        variables: setting.variables,
        wait: WAIT,
        pause,
        observe,
      }),
    leave: async () => Promise.resolve(),
    pause,
  };
}

/**
 * A service of this run alone. It is started once, however often it is
 * reached, and stopped on the way out.
 */
function isolatedDoor(setting: ServiceSetting): ServiceDoor {
  let own: IsolatedService | undefined;
  return {
    reach: async (observe) => {
      own ??= await startIsolatedService({
        command: setting.command,
        variables: setting.variables,
        temporaryRoot: setting.temporaryRoot,
        wait: WAIT,
        pause,
        observe,
      });
      return own;
    },
    leave: async () => {
      if (own?.outcome === 'ready') {
        await own.stop();
      }
    },
    pause,
  };
}

/** The door to the service of the user, or with `--isolated` to its own. */
export function doorOf(
  setting: ServiceSetting,
  { isolated }: { readonly isolated: boolean },
): ServiceDoor {
  return isolated ? isolatedDoor(setting) : sharedDoor(setting);
}
