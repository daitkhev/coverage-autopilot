import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SourceReading } from '#coverage/domain/services/file-state.service';
import { TypescriptSourceClassifier } from '#coverage/infrastructure/classification/typescript-source-classifier.adapter';
import { UnreadableSourceFileError } from '#coverage/infrastructure/errors/unreadable-source-file.error';
import { FilePath } from '#kernel/primitives/file-path';

const DECLARATIONS = `
import type { Widget } from './widget';
export type { Widget } from './widget';
export interface Shelf { readonly widgets: readonly Widget[] }
export type Count = number;
declare const limit: Count;
declare function count(shelf: Shelf): Count;
declare module 'colours' { export const red: string }
export {};
`;

let root: string;
const classifier = new TypescriptSourceClassifier();

function write(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

async function readingOf(path: string, text: string): Promise<SourceReading> {
  write(path, text);
  return classifier.classify({
    workingCopyPath: root,
    path: FilePath.create(path),
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'coverage-autopilot-sources-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('TypescriptSourceClassifier', () => {
  describe('when every top-level statement is a declaration', () => {
    it('should say the file holds declarations only', async () => {
      expect(await readingOf('src/types.ts', DECLARATIONS)).toEqual({
        kind: 'declarations_only',
      });
    });

    it('should say the same of a file with nothing in it', async () => {
      expect(await readingOf('src/empty.ts', '// nothing yet\n')).toEqual({
        kind: 'declarations_only',
      });
    });
  });

  describe('when a statement leaves code that runs', () => {
    it.each([
      [
        'a function',
        'export function sum(a: number, b: number) { return a + b; }',
      ],
      ['a constant', 'export const limit = 3;'],
      ['a class', 'export class Shelf {}'],
      ['an enum', 'export enum Colour { Red }'],
      ['an import that is loaded', "import './register';\nexport type A = 1;"],
      [
        'an import of a value',
        "import { a } from './a';\nexport type A = typeof a;",
      ],
      ['an export of a value', "export { a } from './a';"],
      ['an export of everything', "export * from './a';"],
      ['a call', 'export type A = 1;\nconsole.log(1);'],
    ])('should say a file with %s is executable', async (_name, text) => {
      expect(await readingOf('src/code.ts', text)).toEqual({
        kind: 'executable',
      });
    });

    it('should read a component with markup in a tsx file', async () => {
      const text = 'export const Shelf = () => <ul><li>one</li></ul>;';

      expect(await readingOf('src/shelf.tsx', text)).toEqual({
        kind: 'executable',
      });
    });

    it('should not run the file or look for what it imports', async () => {
      const text = "import { gone } from './no-such-file';\nthrow gone;";

      expect(await readingOf('src/throws.ts', text)).toEqual({
        kind: 'executable',
      });
    });
  });

  describe('when the file does not parse', () => {
    it('should say so with the line and the words of the parser', async () => {
      const text = 'export const a = 1;\nexport function broken( {\n';

      const reading = await readingOf('src/broken.ts', text);

      expect(reading.kind).toBe('parse_failed');
      expect(reading).toHaveProperty(
        'message',
        expect.stringMatching(/^Line [23]: .+ expected\.$/u),
      );
    });

    it('should refuse markup in a file that is not tsx', async () => {
      const text = 'export const Shelf = () => <ul><li>one</li></ul>;';

      expect((await readingOf('src/shelf.ts', text)).kind).toBe('parse_failed');
    });
  });

  describe('when the file cannot be read as a plain file', () => {
    it('should throw UnreadableSourceFileError for a file that is gone', async () => {
      await expect(
        classifier.classify({
          workingCopyPath: root,
          path: FilePath.create('src/gone.ts'),
        }),
      ).rejects.toThrow(
        new UnreadableSourceFileError(
          `The source file ${join(root, 'src/gone.ts')} could not be read.`,
        ),
      );
    });

    it('should refuse a link, which may lead out of the copy', async () => {
      write('outside.ts', 'export const secret = 1;');
      mkdirSync(join(root, 'src'), { recursive: true });
      symlinkSync(join(root, 'outside.ts'), join(root, 'src/linked.ts'));

      await expect(
        classifier.classify({
          workingCopyPath: root,
          path: FilePath.create('src/linked.ts'),
        }),
      ).rejects.toThrow(
        new UnreadableSourceFileError(
          `The source file ${join(root, 'src/linked.ts')} was not read: it is not a plain file.`,
        ),
      );
    });
  });
});
