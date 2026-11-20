import type { Finding } from '#harness/architecture/finding';
import { type Place, placeOf } from '#harness/architecture/places';
import type {
  ImportRecord,
  Project,
  Rule,
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

function edgesOf(project: Project, backend: Backend): Edge[] {
  return project.files.flatMap((file) => {
    const from = placeOf(file.path, backend);
    return file.imports.flatMap((record) =>
      record.target === undefined
        ? []
        : [{ file, record, from, to: placeOf(record.target, backend) }],
    );
  });
}

function findingAt(edge: Edge, rule: string, detail: string): Finding {
  return { rule, path: edge.file.path, line: edge.record.line, detail };
}

/** What is wrong with an edge, or an empty text when nothing is. */
export type EdgeJudge = (edge: Edge, backend: Backend) => string;

/** A rule that judges every edge of the service on its own. */
export function edgeRule(id: string, backend: Backend, judge: EdgeJudge): Rule {
  return {
    id,
    check: (project) =>
      edgesOf(project, backend).flatMap((edge) => {
        const detail = judge(edge, backend);
        return detail === '' ? [] : [findingAt(edge, id, detail)];
      }),
  };
}
