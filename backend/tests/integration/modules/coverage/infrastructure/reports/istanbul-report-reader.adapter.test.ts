import { realpathSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CoverageReport } from '#coverage/application/ports/coverage-report-reader.port';
import { UnreadableCoverageReportError } from '#coverage/infrastructure/errors/unreadable-coverage-report.error';
import { IstanbulReportReader } from '#coverage/infrastructure/reports/istanbul-report-reader.adapter';
import { countersOf } from '#tests/support/coverage-snapshots';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

/*
 * The `json` reports of Istanbul that Jest and Vitest write for the
 * fixture projects in `harness/fixtures/projects`, given every source
 * file of `src/` as the file list. A report keys each file by its
 * absolute path, so a test gives the root of its working copy.
 *
 * `src/used.ts` doubles a number and halves it; its test calls `double`
 * only. `src/unused.ts` is imported by no test. `src/types.ts` holds type
 * declarations alone. `src/broken.ts` does not parse, and neither runner
 * reports it.
 */

interface Span {
  readonly start: { readonly line: number; readonly column: number };
  readonly end: { readonly line: number; readonly column: number };
}

function span(line: number): Span {
  return { start: { line, column: 0 }, end: { line, column: 20 } };
}

function statements(lines: readonly number[]): Record<string, Span> {
  return Object.fromEntries(lines.map((line, id) => [String(id), span(line)]));
}

function hits(counts: readonly number[]): Record<string, number> {
  return Object.fromEntries(counts.map((count, id) => [String(id), count]));
}

function file(path: string, coverage: object): object {
  return { path, all: false, ...coverage };
}

const DOUBLE = { name: 'double', decl: span(1), loc: span(1), line: 1 };
const HALVE = { name: 'halve', decl: span(5), loc: span(5), line: 5 };
const NEVER_IMPORTED = {
  name: 'neverImported',
  decl: span(1),
  loc: span(1),
  line: 1,
};

/** The `if` of `halve`, as both ways of it. */
const IF_OF_HALVE = {
  loc: span(6),
  type: 'if',
  locations: [span(6), span(6)],
  line: 6,
};

/** Jest 30 with the Babel provider: a file of types alone is absent. */
function jestReport(root: string): string {
  return JSON.stringify({
    [`${root}/src/used.ts`]: file(`${root}/src/used.ts`, {
      statementMap: statements([1, 2, 5, 6, 7, 9]),
      fnMap: { '0': DOUBLE, '1': HALVE },
      branchMap: { '0': IF_OF_HALVE },
      s: hits([1, 1, 0, 0, 0, 0]),
      f: hits([1, 0]),
      b: { '0': [0, 0] },
    }),
    [`${root}/src/unused.ts`]: file(`${root}/src/unused.ts`, {
      statementMap: statements([2]),
      fnMap: { '0': NEVER_IMPORTED },
      branchMap: {},
      s: hits([0]),
      f: hits([0]),
      b: {},
    }),
  });
}

/** Vitest 4 with the V8 provider: a file of types alone is zero of zero. */
function vitestReport(root: string): string {
  return JSON.stringify({
    [`${root}/src/types.ts`]: file(`${root}/src/types.ts`, {
      statementMap: {},
      fnMap: {},
      branchMap: {},
      s: {},
      f: {},
      b: {},
    }),
    [`${root}/src/unused.ts`]: file(`${root}/src/unused.ts`, {
      statementMap: statements([2]),
      fnMap: { '0': NEVER_IMPORTED },
      branchMap: {},
      s: hits([0]),
      f: hits([0]),
      b: {},
    }),
    [`${root}/src/used.ts`]: file(`${root}/src/used.ts`, {
      statementMap: statements([2, 6, 7, 9]),
      fnMap: { '0': DOUBLE, '1': HALVE },
      branchMap: { '0': IF_OF_HALVE },
      s: hits([1, 0, 0, 0]),
      f: hits([1, 0]),
      b: { '0': [0, 0] },
    }),
    '/elsewhere/src/used.ts': file('/elsewhere/src/used.ts', {
      statementMap: statements([2]),
      fnMap: {},
      branchMap: {},
      s: hits([1]),
      f: {},
      b: {},
    }),
  });
}

const REPORT =
  'node_modules/.cache/coverage-autopilot/coverage/coverage-final.json';

let folder: ProjectFolder;

async function read(text: string | null): Promise<CoverageReport | null> {
  if (text !== null) {
    folder.write(REPORT, text);
  }
  return new IstanbulReportReader().read({
    workingCopyPath: folder.root,
    reportPath: join(folder.root, REPORT),
  });
}

function pathsOf(report: CoverageReport | null): string[] {
  return [...(report?.keys() ?? [])].sort();
}

beforeEach(() => {
  folder = createProjectFolder();
});

afterEach(() => {
  folder.remove();
});

describe('IstanbulReportReader', () => {
  describe('read', () => {
    describe('when Jest wrote the report', () => {
      it('should count each file by its path in the working copy', async () => {
        const report = await read(jestReport(realpathSync(folder.root)));

        expect(pathsOf(report)).toEqual(['src/unused.ts', 'src/used.ts']);
        expect(
          report?.get('src/used.ts')?.counters.equals(
            countersOf({
              statements: [2, 6],
              branches: [0, 2],
              functions: [1, 2],
              lines: [2, 6],
            }),
          ),
        ).toBe(true);
      });

      it('should list a file that no test imports at zero', async () => {
        const report = await read(jestReport(folder.root));

        expect(
          report?.get('src/unused.ts')?.counters.equals(
            countersOf({
              statements: [0, 1],
              functions: [0, 1],
              lines: [0, 1],
            }),
          ),
        ).toBe(true);
      });
    });

    describe('when Vitest wrote the report', () => {
      it('should say what of a file never ran', async () => {
        const report = await read(vitestReport(folder.root));

        expect(report?.get('src/used.ts')?.uncovered).toMatchObject({
          lines: [
            { start: 6, end: 7 },
            { start: 9, end: 9 },
          ],
          branchLines: [6],
          functions: [{ name: 'halve', line: 5 }],
        });
      });

      it('should keep a row of zero of zero for a file of types alone', async () => {
        const report = await read(vitestReport(folder.root));

        expect(report?.get('src/types.ts')?.counters.isEmpty()).toBe(true);
      });

      it('should leave out a file outside the working copy', async () => {
        const report = await read(vitestReport(folder.root));

        expect(pathsOf(report)).toEqual([
          'src/types.ts',
          'src/unused.ts',
          'src/used.ts',
        ]);
      });
    });

    describe('when a file has no count for a statement or a branch', () => {
      it('should take the statement as never run and leave the branch out', async () => {
        const path = `${folder.root}/src/used.ts`;
        const report = await read(
          JSON.stringify({
            [path]: file(path, {
              statementMap: statements([1, 5]),
              fnMap: { '0': HALVE, '1': DOUBLE },
              branchMap: { '0': IF_OF_HALVE },
              s: hits([1]),
              f: hits([0, 0]),
              b: {},
            }),
          }),
        );

        expect(report?.get('src/used.ts')?.uncovered).toMatchObject({
          lines: [{ start: 5, end: 5 }],
          branchLines: [],
          functions: [
            { name: 'double', line: 1 },
            { name: 'halve', line: 5 },
          ],
        });
      });
    });

    describe('when the runner wrote no report', () => {
      it('should answer with null', async () => {
        await expect(read(null)).resolves.toBeNull();
      });
    });

    describe('when the report is not an Istanbul report', () => {
      it.each([
        ['{ "src', 'is not JSON.'],
        ['{ "/a.ts": { "s": [] } }', 'is not an Istanbul report'],
      ])(
        'should throw UnreadableCoverageReportError for %s',
        async (text, words) => {
          const reading = read(text);

          await expect(reading).rejects.toThrow(UnreadableCoverageReportError);
          await expect(reading).rejects.toThrow(words);
          await expect(reading).rejects.toMatchObject({
            code: 'unreadable_coverage_report',
            retryable: false,
          });
        },
      );
    });
  });
});
