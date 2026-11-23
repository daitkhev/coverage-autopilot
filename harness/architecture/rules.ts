import type { Policy } from '#harness/architecture/policy';
import type { Rule } from '#harness/architecture/project';
import { clientDirection } from '#harness/architecture/rules/client-direction';
import { fileName } from '#harness/architecture/rules/file-name';
import { importCycle } from '#harness/architecture/rules/import-cycle';
import { layerDirection } from '#harness/architecture/rules/layer-direction';
import { lockfileSource } from '#harness/architecture/rules/lockfile-source';
import { misplacedFile } from '#harness/architecture/rules/misplaced-file';
import { moduleBoundary } from '#harness/architecture/rules/module-boundary';
import { moduleDirection } from '#harness/architecture/rules/module-direction';
import { packageManifest } from '#harness/architecture/rules/package-manifest';
import { packagePlacement } from '#harness/architecture/rules/package-placement';
import { relativeImport } from '#harness/architecture/rules/relative-import';
import { testPlacement } from '#harness/architecture/rules/test-placement';
import { unitTestReach } from '#harness/architecture/rules/unit-test-reach';
import { unknownFile } from '#harness/architecture/rules/unknown-file';
import { unknownLayer } from '#harness/architecture/rules/unknown-layer';
import { unknownModule } from '#harness/architecture/rules/unknown-module';
import { unresolvedImport } from '#harness/architecture/rules/unresolved-import';
import { workspaceBoundary } from '#harness/architecture/rules/workspace-boundary';

/** Every rule of the ratchet. A rule that is not here does not run. */
export function rulesOf(policy: Policy): Rule[] {
  const { structure } = policy;
  return [
    clientDirection(structure.frontend),
    fileName(structure.bannedNames),
    importCycle,
    layerDirection(structure.backend),
    lockfileSource(structure),
    misplacedFile(structure.backend),
    moduleBoundary(structure.backend),
    moduleDirection(structure.backend),
    packageManifest(structure),
    packagePlacement(policy),
    relativeImport,
    testPlacement(structure),
    unitTestReach(structure),
    unknownFile(structure),
    unknownLayer(structure.backend),
    unknownModule(structure.backend),
    unresolvedImport,
    workspaceBoundary(structure),
  ];
}
