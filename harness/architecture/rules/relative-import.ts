import { importRule } from '#harness/architecture/import-rule';
import type { Rule } from '#harness/architecture/project';

export const relativeImport: Rule = importRule('relative-import', (record) =>
  record.kind === 'relative'
    ? `"${record.specifier}" is relative. Use an alias.`
    : '',
);
