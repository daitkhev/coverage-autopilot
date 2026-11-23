import type { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import type { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';
import { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import type { FilePath } from '#kernel/primitives/file-path';

/**
 * What the parser says of a source file. Nothing is type-checked and
 * nothing is run. "Declarations only" means that every top-level statement
 * is an interface, a type alias, a type-only import or export, or a
 * `declare` statement.
 */
export type SourceReading =
  | { readonly kind: 'parse_failed'; readonly message: string }
  | { readonly kind: 'declarations_only' }
  | { readonly kind: 'executable' };

/** What the report of the runner has for one file. */
export interface ReportedCoverage {
  readonly counters: CoverageCounters;
  readonly uncovered: UncoveredCode;
}

export interface FileEvidence {
  readonly path: FilePath;
  readonly source: SourceReading;
  /** `null` when the report has nothing for the file. */
  readonly report: ReportedCoverage | null;
  /** What the runner printed about the file, if anything. */
  readonly runnerMessage: string | null;
}

function stateOfCode(evidence: FileEvidence): FileCoverage | UnmeasuredFile {
  const { path, report } = evidence;
  if (report === null) {
    return UnmeasuredFile.create({
      path,
      reason: 'missing_from_report',
      toolMessage: evidence.runnerMessage,
    });
  }
  if (report.counters.isEmpty()) {
    return UnmeasuredFile.create({
      path,
      reason: 'no_counters',
      toolMessage: null,
    });
  }
  return FileCoverage.measured({ path, ...report });
}

/**
 * The state of an eligible file from its two inputs, as the table of "What
 * a snapshot contains" in the system design sets it. The reading of the
 * source decides first, never the counters alone: a runner drops a file,
 * fakes a row of zeros for it or stops, and no report says which.
 */
export function fileStateOf(
  evidence: FileEvidence,
): FileCoverage | UnmeasuredFile {
  const { path, source } = evidence;
  switch (source.kind) {
    case 'parse_failed':
      return UnmeasuredFile.create({
        path,
        reason: 'parse_failed',
        toolMessage: source.message,
      });
    case 'declarations_only':
      return FileCoverage.noExecutableCode(path);
    case 'executable':
      return stateOfCode(evidence);
  }
}
