import type { Finding } from '#harness/architecture/finding';
import { type Place, placeOf } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

const NO_PLACE =
  'The service has modules/<module>/<layer>/, shared/<folder>/ and files ' +
  'at the root of its source, and no other place.';

function problemOf(place: Place, backend: Backend): string {
  if (place.kind === 'unknown') {
    return NO_PLACE;
  }
  if (place.kind === 'shared' && !backend.shared.has(place.part)) {
    const known = [...backend.shared.keys()].join(', ');
    return `"${place.part}" is not a folder of the shared code: ${known}.`;
  }
  const inKnownModule =
    place.kind === 'layer' && backend.modules.has(place.module);
  if (inKnownModule && !backend.layers.has(place.layer)) {
    const known = [...backend.layers.keys()].join(', ');
    return `"${place.layer}" is not a layer. The layers are: ${known}.`;
  }
  return '';
}

function checkWith(backend: Backend, project: Project): Finding[] {
  return project.files.flatMap((file) => {
    const detail = problemOf(placeOf(file.path, backend), backend);
    return detail === ''
      ? []
      : [{ rule: 'unknown-layer', path: file.path, line: 1, detail }];
  });
}

/** A module has the layers the policy lists, and no other folder. */
export function unknownLayer(backend: Backend): Rule {
  return {
    id: 'unknown-layer',
    check: (project) => checkWith(backend, project),
  };
}
