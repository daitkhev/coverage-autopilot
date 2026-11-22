import { type Edge, edgeRule } from '#harness/architecture/edges';
import { moduleOf } from '#harness/architecture/places';
import type { Rule } from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

const BY_MODULE_FILE = 'A module is wired in through its module file only.';

function fromLayer(edge: Edge, layer: string, backend: Backend): string {
  const intoContracts =
    edge.to.kind === 'layer' && backend.contracts.includes(edge.to.layer);
  if (!intoContracts) {
    return 'Another module is reached through its contracts/ only.';
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
  const wiring =
    edge.from.kind === 'module-file' || edge.from.kind === 'service-root';
  return wiring && edge.to.kind !== 'module-file' ? BY_MODULE_FILE : '';
}

/** A module is entered through its contracts, or wired by its module file. */
export function moduleBoundary(backend: Backend): Rule {
  return edgeRule('module-boundary', backend, problemOf);
}
