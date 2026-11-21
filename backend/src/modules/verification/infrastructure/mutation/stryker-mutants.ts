import { createHash } from 'node:crypto';

import { FilePath } from '#kernel/primitives/file-path';
import type {
  MutantResult,
  TestReference,
} from '#verification/application/ports/mutation-runner.port';
import { UnreadableMutationReportError } from '#verification/infrastructure/errors/unreadable-mutation-report.error';
import type {
  StrykerMutant,
  StrykerReport,
} from '#verification/infrastructure/mutation/stryker-report.schema';
import type { Scrub } from '#verification/infrastructure/mutation/tool-text';

type MeasuredStatus = Exclude<StrykerMutant['status'], 'Ignored' | 'Pending'>;

/**
 * A timeout is a status of its own: StrykerJS counts it as detected, and
 * the gate does not.
 */
const STATUS_OF: Readonly<Record<MeasuredStatus, MutantResult['status']>> = {
  Killed: 'killed',
  Survived: 'survived',
  NoCoverage: 'no_coverage',
  Timeout: 'timeout',
  CompileError: 'error',
  RuntimeError: 'error',
};

/** The tests of one report by their ids, which hold in that report alone. */
type Tests = ReadonlyMap<string, TestReference>;

export interface MeasuredMutants {
  readonly mutants: readonly MutantResult[];
  readonly mutantSetHash: string;
}

function testFileOf(key: string): FilePath {
  try {
    return FilePath.create(key);
  } catch {
    throw new UnreadableMutationReportError(
      'The mutation report lists a test that is in no file of the working ' +
        'copy.',
    );
  }
}

function testsOf(report: StrykerReport, scrub: Scrub): Tests {
  const files = Object.entries(report.testFiles ?? {});
  return new Map(
    files.flatMap(([key, { tests }]) => {
      const file = testFileOf(key);
      return tests.map((test): [string, TestReference] => [
        test.id,
        { file, name: scrub(test.name) },
      ]);
    }),
  );
}

function referencesOf(
  ids: readonly string[] | undefined,
  tests: Tests,
): TestReference[] {
  return (ids ?? []).map((id) => {
    const test = tests.get(id);
    if (test === undefined) {
      throw new UnreadableMutationReportError(
        'The mutation report names a test that it does not list.',
      );
    }
    return test;
  });
}

/** An ignored mutant is not part of the set. */
function resultOf(
  mutant: StrykerMutant,
  file: FilePath,
  tests: Tests,
): MutantResult[] {
  if (mutant.status === 'Ignored') {
    return [];
  }
  if (mutant.status === 'Pending') {
    throw new UnreadableMutationReportError(
      'The final mutation report holds a mutant that never ran.',
    );
  }
  const { start, end } = mutant.location;
  return [
    {
      file,
      mutator: mutant.mutatorName,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
      replacement: mutant.replacement,
      status: STATUS_OF[mutant.status],
      coveredBy: referencesOf(mutant.coveredBy, tests),
      killedBy: referencesOf(mutant.killedBy, tests),
    },
  ];
}

/** By code unit, so the order is the same in every locale. */
function compareTexts(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

function byPosition(first: MutantResult, second: MutantResult): number {
  return (
    first.startLine - second.startLine ||
    first.startColumn - second.startColumn ||
    first.endLine - second.endLine ||
    first.endColumn - second.endColumn ||
    compareTexts(first.mutator, second.mutator) ||
    compareTexts(first.replacement, second.replacement)
  );
}

/** What a mutant is, never how it ended. */
function identityOf(mutant: MutantResult): readonly (number | string)[] {
  return [
    mutant.file.value,
    mutant.mutator,
    mutant.startLine,
    mutant.startColumn,
    mutant.endLine,
    mutant.endColumn,
    mutant.replacement,
  ];
}

function hashOf(mutants: readonly MutantResult[]): string {
  const identities = JSON.stringify(mutants.map(identityOf));
  return createHash('sha256').update(identities).digest('hex');
}

/**
 * The mutants of the target in a final report, sorted by position, with
 * the tests that ran and killed each one by file and name. The hash names
 * the set of their identities in that order, whatever their statuses are,
 * so a run with a patch can be told from a run that measured other
 * mutants.
 */
export function mutantsOf(
  report: StrykerReport,
  target: FilePath,
  scrub: Scrub,
): MeasuredMutants {
  const tests = testsOf(report, scrub);
  const mutants = (report.files[target.value]?.mutants ?? [])
    .flatMap((mutant) => resultOf(mutant, target, tests))
    .sort(byPosition);
  return { mutants, mutantSetHash: hashOf(mutants) };
}
