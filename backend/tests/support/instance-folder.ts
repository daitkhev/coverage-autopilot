import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  type InstancePaths,
  instancePaths,
} from '#infrastructure/config/instance-paths';

/**
 * Short enough for the path of a socket in it. The temporary folder of
 * macOS is under `/var/folders/` and leaves too few of the 104 bytes.
 */
const SHORT_ROOT = '/tmp';

/** The paths of an instance directory that is not made yet. */
export interface InstanceFolder {
  readonly paths: InstancePaths;
  /** Removes the directory and everything the test put beside it. */
  remove(): void;
}

/** The paths of an instance in a temporary folder of its own. */
export function createInstanceFolder(): InstanceFolder {
  const root = mkdtempSync(join(SHORT_ROOT, 'instance-'));
  return {
    paths: instancePaths(join(root, 'instance')),
    remove: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
