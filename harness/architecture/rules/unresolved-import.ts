import type { Finding } from '#harness/architecture/finding';
import type { Project, Rule } from '#harness/architecture/project';

function check(project: Project): Finding[] {
  return project.files.flatMap((file) =>
    file.imports
      .filter((record) => record.kind === 'alias')
      .filter((record) => record.target === undefined)
      .map((record) => ({
        rule: 'unresolved-import',
        path: file.path,
        line: record.line,
        detail: `"${record.specifier}" leads to no file.`,
      })),
  );
}

export const unresolvedImport: Rule = { id: 'unresolved-import', check };
