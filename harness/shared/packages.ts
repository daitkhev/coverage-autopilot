import {
  isStringList,
  type JsonRecord,
  readJsonRecord,
  recordListAt,
  stringListAt,
} from '#harness/shared/json';
import { policyFile } from '#harness/shared/policy';

/** Packages that may be imported in some places, and nowhere else. */
export interface PackageRule {
  /** Package names. `node:*` stands for every module built into Node. */
  readonly packages: readonly string[];
  /** Places: a folder ends with a slash, `*` stands for one name. */
  readonly places: readonly string[];
  /** When set, only these names may be imported from the packages. */
  readonly names: readonly string[] | undefined;
}

function ruleOf(record: JsonRecord): PackageRule {
  const names = record['names'];
  return {
    packages: stringListAt(record, 'packages'),
    places: stringListAt(record, 'in'),
    names: isStringList(names) ? names : undefined,
  };
}

export function readPackageRules(): PackageRule[] {
  const file = readJsonRecord(policyFile('packages.json'));
  return recordListAt(file, 'rules').map(ruleOf);
}
