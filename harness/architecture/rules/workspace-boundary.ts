import type { Finding } from '#harness/architecture/finding';
import { workspaceOf } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Structure } from '#harness/shared/structure';

function checkWith(structure: Structure, project: Project): Finding[] {
  return project.files.flatMap((file) => {
    const from = workspaceOf(file.path, structure);
    return file.imports.flatMap((record) => {
      const to =
        record.target === undefined
          ? from
          : workspaceOf(record.target, structure);
      return to === from
        ? []
        : [
            {
              rule: 'workspace-boundary',
              path: file.path,
              line: record.line,
              detail: `${from ?? 'the root'} may not import a file of ${to ?? 'the root'}.`,
            },
          ];
    });
  });
}

/** No alias leads from one workspace into another, or out of one. */
export function workspaceBoundary(structure: Structure): Rule {
  return {
    id: 'workspace-boundary',
    check: (project) => checkWith(structure, project),
  };
}
