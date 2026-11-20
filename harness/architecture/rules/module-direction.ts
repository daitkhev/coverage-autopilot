import { type Edge, edgeRule } from '#harness/architecture/edges';
import { moduleOf } from '#harness/architecture/places';
import type { Rule } from '#harness/architecture/project';
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

/** A module uses only the modules the policy lets it use. */
export function moduleDirection(backend: Backend): Rule {
  return edgeRule('module-direction', backend, problemOf);
}
