import { posix } from 'node:path';

import { isInSomePlace } from '#harness/architecture/patterns';
import { readJsonRecord, stringListAt } from '#harness/shared/json';
import { policyFile } from '#harness/shared/policy';

/** Which files are policy: the rules that a change is judged by. */
export interface FrozenPolicy {
  /** Places whose every file is policy. A folder ends with a slash. */
  readonly places: readonly string[];
  /** Names of files that are policy in any folder. */
  readonly names: readonly string[];
  /** Files in those places that are not policy and travel with code. */
  readonly free: readonly string[];
  /**
   * The free files that may land with a change of the policy as well: a
   * record of the tree, which a change of either kind can move.
   */
  readonly withPolicy: readonly string[];
}

export function readFrozenPolicy(): FrozenPolicy {
  const file = readJsonRecord(policyFile('frozen.json'));
  return {
    places: stringListAt(file, 'places'),
    names: stringListAt(file, 'names'),
    free: stringListAt(file, 'free'),
    withPolicy: stringListAt(file, 'withPolicy'),
  };
}

/** Whether a file is policy. The path starts at the root of the tree. */
export function isFrozen(path: string, policy: FrozenPolicy): boolean {
  if (isInSomePlace(path, policy.free)) {
    return false;
  }
  return (
    isInSomePlace(path, policy.places) ||
    isInSomePlace(posix.basename(path), policy.names)
  );
}
