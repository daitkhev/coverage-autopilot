import { type Edge, edgeRule } from '#harness/architecture/edges';
import { moduleOf, type Place } from '#harness/architecture/places';
import type { Rule } from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

const BY_MODULE_FILE = 'A module is wired in through its module file only.';

/** The places that wire modules together, and never look inside one. */
const WIRING: readonly Place['kind'][] = ['module-file', 'composition'];

function fromLayer(edge: Edge, layer: string, backend: Backend): string {
  const intoContracts =
    edge.to.kind === 'layer' && backend.contracts.includes(edge.to.layer);
  if (!intoContracts) {
    const folders = backend.contracts.map((folder) => `${folder}/`).join(', ');
    return `Another module is reached through its ${folders} only.`;
  }
  return backend.reachOtherModules.includes(layer)
    ? ''
    : `${layer} may not reach another module.`;
}

function problemOf(edge: Edge, backend: Backend): string {
  const target = moduleOf(edge.to);
  if (target === undefined || target === moduleOf(edge.from)) {
    return '';
  }
  if (edge.from.kind === 'layer') {
    return fromLayer(edge, edge.from.layer, backend);
  }
  return WIRING.includes(edge.from.kind) && edge.to.kind !== 'module-file'
    ? BY_MODULE_FILE
    : '';
}

/** A module is entered through its contracts, or wired by its module file. */
export function moduleBoundary(backend: Backend): Rule {
  return edgeRule('module-boundary', backend, problemOf);
}
