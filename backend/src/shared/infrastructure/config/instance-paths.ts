import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

/** Where the service keeps everything of one instance. */
export interface InstancePaths {
  /** Readable by its owner only, and never seen by a sandbox. */
  readonly directory: string;
  readonly database: string;
  /** A SQLite file of its own, held by the one running service. */
  readonly lock: string;
  readonly socket: string;
  /** The files of the store of tool output. */
  readonly artifacts: string;
  readonly workingCopies: string;
}

/** The folder under the home of the user when none is set. */
const DEFAULT_FOLDER = '.coverage-autopilot';

const SOCKET = 'service.sock';

/**
 * The longest path of a Unix socket that worked on macOS. Linux allows a
 * few bytes more, so this is the limit of both.
 */
export const SOCKET_PATH_BYTES = 104;

/**
 * The folder that is set, or the one under the home. The service never
 * changes its working directory, so only an absolute one is a folder.
 */
export function instanceDirectoryOf(
  configured: string | undefined,
  home: string | undefined,
): string {
  return configured ?? join(home ?? '', DEFAULT_FOLDER);
}

/** The paths in an absolute folder, without its `..` and trailing `/`. */
export function instancePaths(directory: string): InstancePaths {
  const root = resolve(directory);
  return {
    directory: root,
    database: join(root, 'service.sqlite'),
    lock: join(root, 'instance.lock'),
    socket: join(root, SOCKET),
    artifacts: join(root, 'artifacts'),
    workingCopies: join(root, 'working-copies'),
  };
}

/** The bytes of the path of the socket in an absolute folder. */
export function socketPathBytes(directory: string): number {
  return Buffer.byteLength(instancePaths(directory).socket);
}

/**
 * The name of an instance outside its folder, such as on its containers:
 * the same for every start over the folder and another for any other
 * folder, and made of hex digits alone, whatever the folder is called.
 */
export function instanceIdOf(paths: InstancePaths): string {
  return createHash('sha256').update(paths.directory).digest('hex');
}
