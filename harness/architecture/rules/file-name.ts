import type { Finding } from '#harness/architecture/finding';
import type { Project, Rule } from '#harness/architecture/project';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function problemOf(path: string, banned: readonly string[]): string {
  const folders = path.split('/');
  const parts = (folders.pop() ?? '').split('.');
  const stem = parts[0] ?? '';
  const taken = [...folders, stem].find((name) => banned.includes(name));
  if (taken !== undefined) {
    return `"${taken}" is not a name. Say what the code is for.`;
  }
  const odd = [...folders, ...parts].find((name) => !KEBAB.test(name));
  return odd === undefined ? '' : `"${odd}" is not kebab-case.`;
}

function checkWith(banned: readonly string[], project: Project): Finding[] {
  return project.files.flatMap((file) => {
    const detail = problemOf(file.path, banned);
    return detail === ''
      ? []
      : [{ rule: 'file-name', path: file.path, line: 1, detail }];
  });
}

/** Names are kebab-case, and a few names that say nothing are refused. */
export function fileName(banned: readonly string[]): Rule {
  return {
    id: 'file-name',
    check: (project) => checkWith(banned, project),
  };
}
