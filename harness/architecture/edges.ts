import type { Finding } from '#harness/architecture/finding';
import { type Place, placeOf } from '#harness/architecture/places';
import type {
  ImportRecord,
  Project,
  SourceFile,
} from '#harness/architecture/project';
import type { Backend } from '#harness/shared/structure';

/** One import that leads to a file, with the places of both ends. */
export interface Edge {
  readonly file: SourceFile;
  readonly record: ImportRecord;
  readonly from: Place;
  readonly to: Place;
}

export function edgesOf(project: Project, backend: Backend): Edge[] {
  return project.files.flatMap((file) => {
    const from = placeOf(file.path, backend);
    return file.imports.flatMap((record) =>
      record.target === undefined
        ? []
        : [{ file, record, from, to: placeOf(record.target, backend) }],
    );
  });
}

export function findingAt(edge: Edge, rule: string, detail: string): Finding {
  return { rule, path: edge.file.path, line: edge.record.line, detail };
}
