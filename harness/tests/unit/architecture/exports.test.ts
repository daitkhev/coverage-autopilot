import { describe, expect, it } from '@jest/globals';

import { parseExports } from '#harness/architecture/exports';

describe('parseExports', () => {
  it('should read every kind of exported declaration, sorted', () => {
    const text = [
      'export const zeta = 1, alpha = 2;',
      'export function run(): void {}',
      'export class Report {}',
      'export interface View {}',
      'export type Id = string;',
      'const hidden = 3;',
      'function alsoHidden(): void {}',
    ].join('\n');

    expect(parseExports('a.ts', text)).toEqual([
      'Id',
      'Report',
      'View',
      'alpha',
      'run',
      'zeta',
    ]);
  });

  it('should read an export list by the name the outside sees', () => {
    const text = 'const a = 1;\nconst b = 2;\nexport { a, b as c };\n';

    expect(parseExports('a.ts', text)).toEqual(['a', 'c']);
  });

  it('should read a re-export by its names', () => {
    const text = "export { a as b } from './a';\nexport type { C } from './c';";

    expect(parseExports('a.ts', text)).toEqual(['C', 'b']);
  });

  it('should read a re-export of everything as a star, or by its name', () => {
    expect(parseExports('a.ts', "export * from './a';")).toEqual(['*']);
    expect(parseExports('a.ts', "export * as all from './a';")).toEqual([
      'all',
    ]);
  });

  it('should give each name once', () => {
    const text = 'export function a(): void;\nexport function a(): void {}\n';

    expect(parseExports('a.ts', text)).toEqual(['a']);
  });

  it('should skip a destructured export it cannot name', () => {
    expect(parseExports('a.ts', 'export const { a } = { a: 1 };')).toEqual([]);
  });

  it('should skip a default export that has no name', () => {
    expect(parseExports('a.ts', 'export default function () {}')).toEqual([]);
  });

  it('should pass over statements that cannot be exported', () => {
    const text = 'start();\nexport const a = 1;\nif (a) {\n  start();\n}\n';

    expect(parseExports('a.ts', text)).toEqual(['a']);
  });

  it('should give nothing for a file that exports nothing', () => {
    expect(parseExports('a.ts', 'const a = 1;\n')).toEqual([]);
  });
});
