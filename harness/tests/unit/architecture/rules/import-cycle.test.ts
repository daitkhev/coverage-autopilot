import { describe, expect, it } from '@jest/globals';

import { importCycle } from '#harness/architecture/rules/import-cycle';
import {
  importOf,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const DETAIL = 'Files import each other in a circle: src/a.ts, src/b.ts.';

describe('importCycle', () => {
  it('should report each file of a circle at the import that closes it', () => {
    const project = projectOf(
      sourceFile('src/a.ts', [
        importOf({ specifier: 'typescript', kind: 'package', line: 1 }),
        importTo('src/b.ts', 2),
      ]),
      sourceFile('src/b.ts', [importTo('src/a.ts', 4)]),
    );

    expect(importCycle.check(project)).toEqual([
      { rule: 'import-cycle', path: 'src/a.ts', line: 2, detail: DETAIL },
      { rule: 'import-cycle', path: 'src/b.ts', line: 4, detail: DETAIL },
    ]);
  });

  it('should count an import of a type as part of a circle', () => {
    const typed = importOf({
      specifier: '#src/a',
      kind: 'alias',
      target: 'src/a.ts',
      typeOnly: true,
    });
    const project = projectOf(
      sourceFile('src/a.ts', [importTo('src/b.ts')]),
      sourceFile('src/b.ts', [typed]),
    );

    expect(importCycle.check(project)).toHaveLength(2);
  });

  it('should pass files that import one way', () => {
    const project = projectOf(
      sourceFile('src/a.ts', [importTo('src/b.ts'), importTo('src/c.ts')]),
      sourceFile('src/b.ts', [importTo('src/c.ts')]),
      sourceFile('src/c.ts'),
    );

    expect(importCycle.check(project)).toEqual([]);
  });

  it('should ignore an import that leads outside the measured files', () => {
    const project = projectOf(
      sourceFile('src/a.ts', [importTo('data/list.json')]),
    );

    expect(importCycle.check(project)).toEqual([]);
  });
});
