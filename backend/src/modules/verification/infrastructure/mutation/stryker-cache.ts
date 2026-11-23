import type {
  StrykerMutant,
  StrykerReport,
} from '#verification/infrastructure/mutation/stryker-report.schema';
import {
  capped,
  type Scrub,
} from '#verification/infrastructure/mutation/tool-text';

/**
 * A reason is kept for a person who looks at the cache. It holds a stack
 * trace at times, and the lines past this say nothing more.
 */
const REASON_CHARACTERS = 1_000;

function mutantToKeep(mutant: StrykerMutant, scrub: Scrub): StrykerMutant {
  const { statusReason, ...rest } = mutant;
  return statusReason === undefined
    ? rest
    : { ...rest, statusReason: capped(scrub(statusReason), REASON_CHARACTERS) };
}

function eachValue<Value, Kept>(
  record: Readonly<Record<string, Value>>,
  keep: (value: Value) => Kept,
): Record<string, Kept> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, keep(value)]),
  );
}

/**
 * The incremental file of StrykerJS as it may be stored: the fields its
 * incremental mode reads, the sources and the results, and no other. The
 * root of the project, the configuration and the facts of the machine
 * name paths of the host, so they are left out. A reason and a test name
 * lose the path of the working copy and the codes of a terminal, and a
 * reason is cut to a length.
 */
export function cacheTextOf(report: StrykerReport, scrub: Scrub): string {
  const files = eachValue(report.files, (file) => ({
    ...file,
    mutants: file.mutants.map((mutant) => mutantToKeep(mutant, scrub)),
  }));
  const testFiles = eachValue(report.testFiles ?? {}, (file) => ({
    ...file,
    tests: file.tests.map((test) => ({ ...test, name: scrub(test.name) })),
  }));
  return JSON.stringify({
    schemaVersion: report.schemaVersion,
    thresholds: report.thresholds,
    files,
    testFiles,
  });
}
