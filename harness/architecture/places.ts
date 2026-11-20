import type { Backend, Structure } from '#harness/shared/structure';

const MODULES = 'modules/';
const SHARED = 'shared/';

/** Where a file is in the service, as its path says. */
export type Place =
  | {
      readonly kind: 'layer';
      readonly module: string;
      readonly layer: string;
      /** The path inside the module, such as `domain/entities/x.ts`. */
      readonly inside: string;
    }
  | {
      readonly kind: 'module-file';
      readonly module: string;
      readonly inside: string;
    }
  | { readonly kind: 'shared'; readonly part: string }
  | { readonly kind: 'service-root' }
  /** In the source of the service, in no place the service has. */
  | { readonly kind: 'unknown' }
  /** Outside the source of the service. */
  | { readonly kind: 'other' };

const OTHER: Place = { kind: 'other' };
const UNKNOWN: Place = { kind: 'unknown' };

function inModules(rest: string): Place {
  const [module = '', ...inside] = rest.split('/');
  const layer = inside[0] ?? '';
  if (inside.length === 0) {
    return UNKNOWN;
  }
  return inside.length === 1
    ? { kind: 'module-file', module, inside: layer }
    : { kind: 'layer', module, layer, inside: inside.join('/') };
}

function inShared(rest: string): Place {
  const [part = '', ...inside] = rest.split('/');
  return inside.length === 0 ? UNKNOWN : { kind: 'shared', part };
}

export function placeOf(path: string, backend: Backend): Place {
  if (!path.startsWith(backend.source)) {
    return OTHER;
  }
  const rest = path.slice(backend.source.length);
  if (rest.startsWith(MODULES)) {
    return inModules(rest.slice(MODULES.length));
  }
  if (rest.startsWith(SHARED)) {
    return inShared(rest.slice(SHARED.length));
  }
  return rest.includes('/') ? UNKNOWN : { kind: 'service-root' };
}

/** The module a place belongs to, when it belongs to one. */
export function moduleOf(place: Place): string | undefined {
  return place.kind === 'layer' || place.kind === 'module-file'
    ? place.module
    : undefined;
}

/** The workspace a file is in, when it is in one. */
export function workspaceOf(
  path: string,
  structure: Structure,
): string | undefined {
  const first = path.split('/')[0] ?? '';
  return structure.workspaces.has(first) && path.includes('/')
    ? first
    : undefined;
}
