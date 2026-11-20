import type { Finding } from '#harness/architecture/finding';
import type { Project, Rule } from '#harness/architecture/project';

function check(project: Project): Finding[] {
  return project.files.flatMap((file) =>
    file.imports
      .filter((record) => record.kind === 'relative')
      .map((record) => ({
        rule: 'relative-import',
        path: file.path,
        line: record.line,
        detail: `"${record.specifier}" is relative. Use an alias.`,
      })),
  );
}

export const relativeImport: Rule = { id: 'relative-import', check };
