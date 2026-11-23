import { type PackageRule, readPackageRules } from '#harness/shared/packages';
import { readStructure, type Structure } from '#harness/shared/structure';

/** Everything the rules of the ratchet are judged by. */
export interface Policy {
  readonly structure: Structure;
  readonly packages: readonly PackageRule[];
}

export function readPolicy(): Policy {
  return { structure: readStructure(), packages: readPackageRules() };
}
