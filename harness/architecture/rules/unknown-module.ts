import type { Finding } from '#harness/architecture/finding';
import { moduleOf, placeOf } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

function checkWith(backend: Backend, project: Project): Finding[] {
  const known = [...backend.modules.keys()].join(', ');
  return project.files.flatMap((file) => {
    const module = moduleOf(placeOf(file.path, backend));
    return module === undefined || backend.modules.has(module)
      ? []
      : [
          {
            rule: 'unknown-module',
            path: file.path,
            line: 1,
            detail: `"${module}" is not a module. The modules are: ${known}.`,
          },
        ];
  });
}

/** The service has the modules the policy lists, and no other. */
export function unknownModule(backend: Backend): Rule {
  return {
    id: 'unknown-module',
    check: (project) => checkWith(backend, project),
  };
}
