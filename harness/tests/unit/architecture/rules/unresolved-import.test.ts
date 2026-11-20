import { describe, expect, it } from '@jest/globals';

import { unresolvedImport } from '#harness/architecture/rules/unresolved-import';
import {
  importOf,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

describe('unresolvedImport', () => {
  it('should report an alias that leads to no file', () => {
    const project = projectOf(
      sourceFile('src/a.ts', [
        importOf({ specifier: '#src/gone', kind: 'alias', line: 3 }),
      ]),
    );

    expect(unresolvedImport.check(project)).toEqual([
      {
        rule: 'unresolved-import',
        path: 'src/a.ts',
        line: 3,
        detail: '"#src/gone" leads to no file.',
      },
    ]);
  });

  it('should pass an alias that leads to a file', () => {
    const project = projectOf(sourceFile('src/a.ts', [importTo('src/b.ts')]));

    expect(unresolvedImport.check(project)).toEqual([]);
  });

  it('should leave packages and relative imports to other rules', () => {
    const project = projectOf(
      sourceFile('src/a.ts', [
        importOf({ specifier: 'typescript', kind: 'package' }),
        importOf({ specifier: './b', kind: 'relative' }),
        importOf({ specifier: 'node:fs', kind: 'builtin' }),
      ]),
    );

    expect(unresolvedImport.check(project)).toEqual([]);
  });
});
