import { importRule } from '#harness/architecture/import-rule';
import type { Rule } from '#harness/architecture/project';

export const unresolvedImport: Rule = importRule(
  'unresolved-import',
  (record) =>
    record.kind === 'alias' && record.target === undefined
      ? `"${record.specifier}" leads to no file.`
      : '',
);
