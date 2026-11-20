import type { Rule } from '#harness/architecture/project';
import { fileName } from '#harness/architecture/rules/file-name';
import { importCycle } from '#harness/architecture/rules/import-cycle';
import { relativeImport } from '#harness/architecture/rules/relative-import';
import { unresolvedImport } from '#harness/architecture/rules/unresolved-import';
import type { Structure } from '#harness/shared/policy';

/** Every rule of the ratchet. A rule that is not here does not run. */
export function rulesOf(structure: Structure): Rule[] {
  return [
    fileName(structure.bannedNames),
    importCycle,
    relativeImport,
    unresolvedImport,
  ];
}
