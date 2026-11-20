import type { Finding } from '#harness/architecture/finding';
import { findCycles, type Graph } from '#harness/architecture/graph';
import type { Project, Rule, SourceFile } from '#harness/architecture/project';

function targetsOf(file: SourceFile): string[] {
  return file.imports.flatMap((record) =>
    record.target === undefined ? [] : [record.target],
  );
}

/** The design graph: every import counts, `import type` included. */
function graphOf(project: Project): Graph {
  return new Map(project.files.map((file) => [file.path, targetsOf(file)]));
}

function findingOf(file: SourceFile, group: readonly string[]): Finding {
  const inside = file.imports.find(
    (record) => record.target !== undefined && group.includes(record.target),
  );
  return {
    rule: 'import-cycle',
    path: file.path,
    line: inside?.line ?? 1,
    detail: `Files import each other in a circle: ${group.join(', ')}.`,
  };
}

function check(project: Project): Finding[] {
  const byPath = new Map(project.files.map((file) => [file.path, file]));
  return findCycles(graphOf(project)).flatMap((group) =>
    group.flatMap((path) => {
      const file = byPath.get(path);
      return file === undefined ? [] : [findingOf(file, group)];
    }),
  );
}

export const importCycle: Rule = { id: 'import-cycle', check };
