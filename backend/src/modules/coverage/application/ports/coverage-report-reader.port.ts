import type { ReportedCoverage } from '#coverage/domain/services/file-state.service';

export interface CoverageReportRequest {
  readonly workingCopyPath: string;
  /** The absolute path of the report the runner was told to write. */
  readonly reportPath: string;
}

/** What the report has for each file, by its path in the working copy. */
export type CoverageReport = ReadonlyMap<string, ReportedCoverage>;

/**
 * Reads the report of a runner. The report is outside data: it is parsed,
 * its paths are made relative to the working copy, and a file outside the
 * copy is left out.
 */
export interface CoverageReportReader {
  /** `null` when the runner wrote no report. */
  read(request: CoverageReportRequest): Promise<CoverageReport | null>;
}

/** The injection token of the reader of coverage reports. */
export const COVERAGE_REPORT_READER = Symbol('CoverageReportReader');
