import { describe, expect, it } from 'vitest';

import { relativeImport } from '#harness/architecture/rules/relative-import';
import {
  importOf,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

describe('relativeImport', () => {
  it('should report every relative import with its line', () => {
    const project = projectOf(
      sourceFile('src/a.ts', [
        importOf({ specifier: './b', kind: 'relative', line: 2 }),
        importOf({ specifier: '..', kind: 'relative', line: 5 }),
      ]),
    );

    expect(relativeImport.check(project)).toEqual([
      {
        rule: 'relative-import',
        path: 'src/a.ts',
        line: 2,
        detail: '"./b" is relative. Use an alias.',
      },
      {
        rule: 'relative-import',
        path: 'src/a.ts',
        line: 5,
        detail: '".." is relative. Use an alias.',
      },
    ]);
  });

  it('should pass an alias, a package and a built-in module', () => {
    const project = projectOf(
      sourceFile('src/a.ts', [
        importTo('src/b.ts'),
        importOf({ specifier: 'typescript', kind: 'package' }),
        importOf({ specifier: 'node:fs', kind: 'builtin' }),
      ]),
    );

    expect(relativeImport.check(project)).toEqual([]);
  });
});
