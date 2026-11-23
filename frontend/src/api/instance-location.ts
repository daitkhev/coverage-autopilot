import { join, resolve } from 'node:path';

/** Where the client finds a service and what the service leaves for it. */
export interface InstanceLocation {
  /** The instance directory, absolute, as the service names it. */
  readonly directory: string;
  /** Where the service listens. */
  readonly socket: string;
  /** Where a service the client starts writes its standard error. */
  readonly log: string;
}

/** What the entry file read of its process, to find the instance with. */
export interface InstanceSetting {
  /** The value of `AUTOPILOT_INSTANCE_DIR`, when it is set. */
  readonly instanceDirectory?: string;
  /** The home folder of the user. */
  readonly home: string;
}

/*
 * The client cannot import the service, so it repeats the names the
 * service gives its folder and its socket. An end-to-end test holds the
 * two together.
 */
const DEFAULT_FOLDER = '.coverage-autopilot';
const SOCKET = 'service.sock';
const LOG = 'service.log';

/**
 * Read as the service reads a variable: the space around it is dropped,
 * and an empty one is not set.
 */
function setValueOf(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * The paths in a folder, without its `..` and trailing `/`, as the
 * service makes them.
 */
export function instanceLocationIn(directory: string): InstanceLocation {
  const root = resolve(directory);
  return {
    directory: root,
    socket: join(root, SOCKET),
    log: join(root, LOG),
  };
}

/** The folder that is set, or the one under the home. */
export function instanceLocationOf(setting: InstanceSetting): InstanceLocation {
  const configured = setValueOf(setting.instanceDirectory);
  return instanceLocationIn(
    configured ?? join(setting.home.trim(), DEFAULT_FOLDER),
  );
}
