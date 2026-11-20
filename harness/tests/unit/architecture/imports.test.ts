import { describe, expect, it } from '@jest/globals';

import { parseImports } from '#harness/architecture/imports';

describe('parseImports', () => {
  it('should read a plain import with its line', () => {
    const text = "// first line\nimport { b } from '#src/b';\n";

    expect(parseImports('a.ts', text)).toEqual([
      { specifier: '#src/b', line: 2, typeOnly: false },
    ]);
  });

  it('should mark import type as type only', () => {
    const text = "import type { B } from '#src/b';\n";

    expect(parseImports('a.ts', text)).toEqual([
      { specifier: '#src/b', line: 1, typeOnly: true },
    ]);
  });

  it('should keep an import with inline type names as loaded', () => {
    const text = "import { type B } from '#src/b';\n";

    expect(parseImports('a.ts', text)[0]?.typeOnly).toBe(false);
  });

  it('should read a re-export and tell export type apart', () => {
    const text = "export { b } from './b';\nexport type { C } from './c';\n";

    expect(parseImports('a.ts', text)).toEqual([
      { specifier: './b', line: 1, typeOnly: false },
      { specifier: './c', line: 2, typeOnly: true },
    ]);
  });

  it('should read a dynamic import', () => {
    const text = "export const load = () =>\n  import('./b');\n";

    expect(parseImports('a.ts', text)).toEqual([
      { specifier: './b', line: 2, typeOnly: false },
    ]);
  });

  it('should read a type written as import()', () => {
    const text = "export type B = import('./b').B;\n";

    expect(parseImports('a.ts', text)).toEqual([
      { specifier: './b', line: 1, typeOnly: true },
    ]);
  });

  it('should read a side-effect import', () => {
    expect(parseImports('a.ts', "import './setup';\n")).toEqual([
      { specifier: './setup', line: 1, typeOnly: false },
    ]);
  });

  describe('when there is nothing to follow', () => {
    it('should skip an export without a source', () => {
      expect(parseImports('a.ts', 'export const a = 1;\n')).toEqual([]);
    });

    it('should skip a dynamic import of a computed name', () => {
      const text = 'export const load = (name: string) => import(name);\n';

      expect(parseImports('a.ts', text)).toEqual([]);
    });

    it('should skip a dynamic import with no argument', () => {
      expect(parseImports('a.ts', 'export const x = import();\n')).toEqual([]);
    });
  });

  it('should read a file that does not compile', () => {
    const text = "import { b } from './b';\nconst a: number = 'text';\n";

    expect(parseImports('a.ts', text)).toHaveLength(1);
  });
});
