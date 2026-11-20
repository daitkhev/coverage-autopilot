import { type Edge, edgesOf, findingAt } from '#harness/architecture/edges';
import type { Finding } from '#harness/architecture/finding';
import { moduleOf } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

function problemOf(edge: Edge, backend: Backend): string {
  const from = moduleOf(edge.from);
  const to = moduleOf(edge.to);
  if (from === undefined || to === undefined || from === to) {
    return '';
  }
  const uses = backend.modules.get(from);
  const known = uses !== undefined && backend.modules.has(to);
  return known && !uses.includes(to) ? `${from} may not use ${to}.` : '';
}

function checkWith(backend: Backend, project: Project): Finding[] {
  return edgesOf(project, backend).flatMap((edge) => {
    const detail = problemOf(edge, backend);
    return detail === '' ? [] : [findingAt(edge, 'module-direction', detail)];
  });
}

/** A module uses only the modules the policy lets it use. */
export function moduleDirection(backend: Backend): Rule {
  return {
    id: 'module-direction',
    check: (project) => checkWith(backend, project),
  };
}
