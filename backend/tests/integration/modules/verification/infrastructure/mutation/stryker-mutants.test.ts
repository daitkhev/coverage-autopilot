import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import {
  baselineReport,
  listingReport,
  type MutantSpec,
  OLD_TESTS,
  patchedReport,
  reportOf,
  TARGET,
} from '#tests/support/mutation-reports';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { UnreadableMutationReportError } from '#verification/infrastructure/errors/unreadable-mutation-report.error';
import {
  listedMutantsOf,
  mutantsOf,
} from '#verification/infrastructure/mutation/stryker-mutants';
import type { StrykerReport } from '#verification/infrastructure/mutation/stryker-report.schema';
import { parseStrykerReport } from '#verification/infrastructure/mutation/stryker-report-reading';
import { scrubberOf } from '#verification/infrastructure/mutation/tool-text';

const KILLED: MutantSpec = {
  id: '1',
  mutatorName: 'BooleanLiteral',
  replacement: 'false',
  at: '2:7-2:15',
  status: 'Killed',
  killedBy: ['0'],
  coveredBy: ['0'],
};

/** A mutant that names no test at all. */
const BARE: MutantSpec = {
  id: '1',
  mutatorName: 'BooleanLiteral',
  replacement: 'false',
  at: '2:7-2:15',
  status: 'Survived',
};

let folder: ProjectFolder;

function reportFrom(text: string): StrykerReport {
  const parsed = parseStrykerReport(text);
  if (parsed.outcome !== 'read') {
    throw new Error(parsed.problem);
  }
  return parsed.report;
}

function measured(text: string): ReturnType<typeof mutantsOf> {
  return mutantsOf(
    reportFrom(text),
    FilePath.create(TARGET),
    scrubberOf(folder.root),
  );
}

function withMutants(
  mutants: readonly MutantSpec[],
  tests: Readonly<Record<string, readonly (readonly string[])[]>> = {
    [OLD_TESTS]: [['0', 'discount should apply the rate']],
  },
): string {
  return reportOf({ projectRoot: folder.root, tests, mutants });
}

beforeEach(() => {
  folder = createProjectFolder();
});

afterEach(() => {
  folder.remove();
});

describe('mutantsOf', () => {
  it('should name a set by the identities of its mutants, not by their statuses', () => {
    const baseline = measured(baselineReport(folder.root));
    const patched = measured(patchedReport(folder.root));

    expect(baseline.mutantSetHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(patched.mutantSetHash).toBe(baseline.mutantSetHash);
  });

  it('should name another set by another hash', () => {
    const one = measured(withMutants([KILLED]));
    const moved = measured(withMutants([{ ...KILLED, at: '2:8-2:15' }]));
    const other = measured(withMutants([{ ...KILLED, replacement: 'true' }]));
    const two = measured(
      withMutants([KILLED, { ...KILLED, id: '2', mutatorName: 'Regex' }]),
    );

    const hashes = [one, moved, other, two].map((set) => set.mutantSetHash);
    expect(new Set(hashes).size).toBe(4);
  });

  it('should give the same answer in whatever order the tool lists them', () => {
    const second = { ...KILLED, id: '2', at: '1:1-1:5' };

    const forward = measured(withMutants([KILLED, second]));
    const backward = measured(withMutants([second, KILLED]));

    expect(backward).toEqual(forward);
    expect(forward.mutants.map(({ startLine }) => startLine)).toEqual([1, 2]);
  });

  it('should leave an ignored mutant out of the set', () => {
    const ignored: MutantSpec = { ...KILLED, id: '2', status: 'Ignored' };

    expect(measured(withMutants([KILLED, ignored]))).toEqual(
      measured(withMutants([KILLED])),
    );
  });

  it('should read the mutants of the target alone', () => {
    const report = JSON.parse(withMutants([KILLED])) as {
      files: Record<string, unknown>;
    };
    report.files['src/other.ts'] = report.files[TARGET];

    expect(measured(JSON.stringify(report)).mutants).toHaveLength(1);
  });

  it('should answer an empty set for a target with no mutant', () => {
    const report = JSON.parse(withMutants([])) as { files: object };
    report.files = {};

    expect(measured(JSON.stringify(report)).mutants).toEqual([]);
  });

  it('should take a mutant that lists no test as run by none', () => {
    const [mutant] = measured(withMutants([BARE])).mutants;

    expect(mutant).toMatchObject({ killedBy: [], coveredBy: [] });
  });

  it('should read a report that lists no test file, as the schema allows', () => {
    const report = JSON.parse(withMutants([BARE])) as { testFiles?: object };
    delete report.testFiles;

    expect(measured(JSON.stringify(report)).mutants).toHaveLength(1);
  });

  describe('when a final report holds a mutant that never ran', () => {
    it('should throw UnreadableMutationReportError', () => {
      const pending: MutantSpec = { ...KILLED, status: 'Pending' };

      expect(() => measured(withMutants([pending]))).toThrow(
        new UnreadableMutationReportError(
          'The final mutation report holds a mutant that never ran.',
        ),
      );
    });
  });

  describe('when a mutant names a test the report does not list', () => {
    it('should throw UnreadableMutationReportError', () => {
      const stray: MutantSpec = { ...KILLED, coveredBy: ['0', '7'] };

      expect(() => measured(withMutants([stray]))).toThrow(
        new UnreadableMutationReportError(
          'The mutation report names a test that it does not list.',
        ),
      );
    });
  });

  describe.each([
    ['in no file', ''],
    ['outside the working copy', '../shared/price.test.ts'],
    ['by an absolute path', '/work/tests/price.test.ts'],
  ])('when the report lists a test %s', (_, file) => {
    it('should throw UnreadableMutationReportError', () => {
      const text = withMutants([KILLED], { [file]: [['0', 'a test']] });

      expect(() => measured(text)).toThrow(
        new UnreadableMutationReportError(
          'The mutation report lists a test that is in no file of the ' +
            'working copy.',
        ),
      );
    });
  });
});

describe('listedMutantsOf', () => {
  it('should read no test of the command, and cover no mutant', () => {
    const listed = listedMutantsOf(
      reportFrom(listingReport(folder.root)),
      FilePath.create(TARGET),
      scrubberOf(folder.root),
    );

    expect(listed.mutants.map(({ status }) => status)).toEqual(
      Array.from({ length: listed.mutants.length }, () => 'no_coverage'),
    );
    expect(listed.mutantSetHash).toBe(
      measured(baselineReport(folder.root)).mutantSetHash,
    );
  });
});
