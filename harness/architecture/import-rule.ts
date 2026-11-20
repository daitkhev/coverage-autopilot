import type { ImportRecord, Rule } from '#harness/architecture/project';

/** What is wrong with an import, or an empty text when nothing is. */
export type ImportJudge = (record: ImportRecord) => string;

/** A rule that judges every import by itself, wherever its file is. */
export function importRule(id: string, judge: ImportJudge): Rule {
  return {
    id,
    check: (project) =>
      project.files.flatMap((file) =>
        file.imports.flatMap((record) => {
          const detail = judge(record);
          return detail === ''
            ? []
            : [{ rule: id, path: file.path, line: record.line, detail }];
        }),
      ),
  };
}
