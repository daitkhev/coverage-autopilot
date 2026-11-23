import { join } from 'node:path';

import { HarnessError } from '#harness/shared/harness.error';
import { isStringList, readJsonRecord, recordAt } from '#harness/shared/json';
import { HARNESS_ROOT } from '#harness/shared/policy';

/** The rules of a commit message, from the root of the repository. */
export const COMMIT_RULES = 'harness/configs/commitlint.json';

/** Where a rule of commitlint keeps its value: after level and sense. */
const VALUE = 2;

/**
 * The types a commit message may start with. A branch is named after one
 * of them, so the name of a branch is read from the same list.
 */
export function readCommitTypes(
  path = join(HARNESS_ROOT, 'configs/commitlint.json'),
): string[] {
  const file = readJsonRecord(path);
  const rule = recordAt(file, 'rules')['type-enum'];
  const types: unknown = Array.isArray(rule) ? rule[VALUE] : undefined;
  if (!isStringList(types)) {
    throw new HarnessError(`${COMMIT_RULES} has no list of types.`);
  }
  return types;
}
