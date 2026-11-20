import type { Finding } from '#harness/architecture/finding';
import { moduleOf, type Place, placeOf } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

const MODULE_SUFFIX = '.module.ts';

function suffixProblem(inside: string, backend: Backend): string {
  for (const [suffix, folders] of backend.suffixes) {
    const misplaced =
      inside.endsWith(suffix) &&
      !folders.some((folder) => inside.startsWith(folder));
    if (misplaced) {
      return `A "${suffix}" file belongs in ${folders.join(' or ')}.`;
    }
  }
  return inside.endsWith(MODULE_SUFFIX)
    ? `A "${MODULE_SUFFIX}" file belongs at the root of its module.`
    : '';
}

function problemOf(place: Place, backend: Backend): string {
  if (place.kind === 'module-file') {
    const expected = `${place.module}${MODULE_SUFFIX}`;
    return place.inside === expected
      ? ''
      : `Only "${expected}" may be at the root of this module.`;
  }
  return place.kind === 'layer' ? suffixProblem(place.inside, backend) : '';
}

function checkWith(backend: Backend, project: Project): Finding[] {
  return project.files.flatMap((file) => {
    const place = placeOf(file.path, backend);
    const module = moduleOf(place);
    const known = module !== undefined && backend.modules.has(module);
    const detail = known ? problemOf(place, backend) : '';
    return detail === ''
      ? []
      : [{ rule: 'misplaced-file', path: file.path, line: 1, detail }];
  });
}

/** A file with a role suffix is in the folder of that role. */
export function misplacedFile(backend: Backend): Rule {
  return {
    id: 'misplaced-file',
    check: (project) => checkWith(backend, project),
  };
}
