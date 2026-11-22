import { chmodSync, mkdirSync } from 'node:fs';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import { UnusableInstanceDirectoryError } from '#infrastructure/service/errors/unusable-instance-directory.error';

/** Read, written and entered by its owner, and by no one else. */
const OWNER_ONLY = 0o700;

/**
 * Makes the instance directory and its folders when they are missing, and
 * keeps the directory to its owner: one that exists with wider rights is
 * narrowed. No one else can pass the directory, so a folder in it is not
 * narrowed again. The length of the path of the socket is not checked
 * here: the configuration refused a directory too long for it.
 */
export function prepareInstanceDirectory(paths: InstancePaths): void {
  try {
    mkdirSync(paths.directory, { recursive: true, mode: OWNER_ONLY });
    chmodSync(paths.directory, OWNER_ONLY);
    for (const folder of [paths.artifacts, paths.workingCopies]) {
      mkdirSync(folder, { recursive: true, mode: OWNER_ONLY });
    }
  } catch (error) {
    throw new UnusableInstanceDirectoryError(
      `The instance directory ${paths.directory} cannot be made and kept ` +
        `to its owner: ${String(error)}`,
      { cause: error },
    );
  }
}
