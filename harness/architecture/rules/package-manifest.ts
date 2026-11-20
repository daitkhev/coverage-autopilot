import { posix } from 'node:path';

import type { Finding } from '#harness/architecture/finding';
import { workspaceOf } from '#harness/architecture/places';
import type { Manifest, Project, Rule } from '#harness/architecture/project';
import { isRecord, type JsonRecord } from '#harness/shared/json';
import type { Structure } from '#harness/shared/structure';

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];

function fieldProblems(content: JsonRecord, structure: Structure): string[] {
  return Object.keys(content)
    .filter((field) => !structure.manifestFields.includes(field))
    .map((field) => `The field "${field}" is not allowed in a workspace.`);
}

function aliasProblems(
  content: JsonRecord,
  expected: ReadonlyMap<string, string>,
): string[] {
  const declared = isRecord(content['imports']) ? content['imports'] : {};
  const same =
    JSON.stringify(Object.entries(declared)) ===
    JSON.stringify([...expected.entries()]);
  return same ? [] : ['"imports" differs from the alias table of the policy.'];
}

function versionProblems(content: JsonRecord): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const list = content[field];
    return Object.entries(isRecord(list) ? list : {})
      .filter(([, version]) => !EXACT_VERSION.test(String(version)))
      .map(([name]) => `The version of "${name}" is not one exact version.`);
  });
}

function problemsOf(manifest: Manifest, structure: Structure): string[] {
  const folder = posix.dirname(manifest.path);
  const expected = structure.workspaces.get(folder);
  if (workspaceOf(manifest.path, structure) !== undefined && !expected) {
    return ['A workspace has one package.json, at its root.'];
  }
  if (expected === undefined || !isRecord(manifest.content)) {
    return [];
  }
  return [
    ...fieldProblems(manifest.content, structure),
    ...aliasProblems(manifest.content, expected),
    ...versionProblems(manifest.content),
  ];
}

function checkWith(structure: Structure, project: Project): Finding[] {
  return project.manifests.flatMap((manifest) =>
    problemsOf(manifest, structure).map((detail) => ({
      rule: 'package-manifest',
      path: manifest.path,
      line: 1,
      detail,
    })),
  );
}

/** The `package.json` of a workspace holds what the policy lists. */
export function packageManifest(structure: Structure): Rule {
  return {
    id: 'package-manifest',
    check: (project) => checkWith(structure, project),
  };
}
