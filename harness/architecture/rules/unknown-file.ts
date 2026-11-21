import { posix } from 'node:path';

import type { Finding } from '#harness/architecture/finding';
import { workspaceOf } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Structure } from '#harness/shared/structure';

/** The name under which the policy lists the files of a root. */
const ROOT = '';

/** `package-manifest` judges this file wherever it is. */
const MANIFEST = 'package.json';

/** What is wrong with a file at `inside`, a path within its workspace. */
function placeProblem(
  inside: string,
  allowed: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  const folder = inside.slice(0, inside.indexOf('/') + 1);
  const kinds = allowed.get(folder);
  if (folder === ROOT) {
    return kinds?.includes(inside) === true
      ? undefined
      : 'A workspace does not have this file at its root.';
  }
  if (kinds === undefined) {
    return `A workspace has no folder "${folder}".`;
  }
  return kinds.includes(posix.extname(inside))
    ? undefined
    : `A file of this kind does not belong in "${folder}".`;
}

function fileProblem(path: string, structure: Structure): string | undefined {
  const workspace = workspaceOf(path, structure) ?? '';
  const allowed = structure.workspaceFiles.get(workspace);
  if (allowed === undefined || posix.basename(path) === MANIFEST) {
    return undefined;
  }
  return placeProblem(path.slice(workspace.length + 1), allowed);
}

function linkProblem(
  path: string,
  project: Project,
  structure: Structure,
): string | undefined {
  const target = project.links.get(path);
  const excluded = structure.excluded.some((prefix) => path.startsWith(prefix));
  if (target === undefined || excluded) {
    return undefined;
  }
  return structure.links.get(path) === target
    ? undefined
    : `A link to "${target}" is not in the list of links of the policy.`;
}

function checkWith(structure: Structure, project: Project): Finding[] {
  return project.paths.flatMap((path) => {
    const problem =
      linkProblem(path, project, structure) ?? fileProblem(path, structure);
    return problem === undefined
      ? []
      : [{ rule: 'unknown-file', path, line: 1, detail: problem }];
  });
}

/**
 * A workspace holds only the files the policy lists for each of its
 * places, so a second configuration of a tool cannot be put nearer to the
 * code. And the tree holds no symbolic link but the ones the policy lists,
 * each with its target.
 */
export function unknownFile(structure: Structure): Rule {
  return {
    id: 'unknown-file',
    check: (project) => checkWith(structure, project),
  };
}
