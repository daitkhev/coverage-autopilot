import { type Edge, edgesOf, findingAt } from '#harness/architecture/edges';
import type { Finding } from '#harness/architecture/finding';
import { moduleOf, type Place } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

type LayerPlace = Extract<Place, { kind: 'layer' }>;
type SharedPlace = Extract<Place, { kind: 'shared' }>;

function fromLayer(from: LayerPlace, to: Place, backend: Backend): string {
  const rule = backend.layers.get(from.layer);
  if (rule === undefined) {
    return '';
  }
  if (to.kind === 'shared') {
    return rule.shared.includes(to.part)
      ? ''
      : `${from.layer} may not import shared/${to.part}.`;
  }
  if (moduleOf(to) !== from.module) {
    return '';
  }
  if (to.kind === 'module-file') {
    return `${from.layer} may not import the module file.`;
  }
  return to.kind === 'layer' && !rule.layers.includes(to.layer)
    ? `${from.layer} may not import ${to.layer}.`
    : '';
}

function fromShared(from: SharedPlace, to: Place, backend: Backend): string {
  if (moduleOf(to) !== undefined) {
    return `shared/${from.part} may not import a module.`;
  }
  const allowed = backend.shared.get(from.part) ?? [];
  const foreign = to.kind === 'shared' && to.part !== from.part;
  return foreign && !allowed.includes(to.part)
    ? `shared/${from.part} may not import shared/${to.part}.`
    : '';
}

function problemOf(edge: Edge, backend: Backend): string {
  if (edge.from.kind === 'layer') {
    return fromLayer(edge.from, edge.to, backend);
  }
  return edge.from.kind === 'shared'
    ? fromShared(edge.from, edge.to, backend)
    : '';
}

function checkWith(backend: Backend, project: Project): Finding[] {
  return edgesOf(project, backend).flatMap((edge) => {
    const detail = problemOf(edge, backend);
    return detail === '' ? [] : [findingAt(edge, 'layer-direction', detail)];
  });
}

/** Inside a module and in the shared code, imports point one way. */
export function layerDirection(backend: Backend): Rule {
  return {
    id: 'layer-direction',
    check: (project) => checkWith(backend, project),
  };
}
