import { describe, expect, it } from 'vitest';

import { MutationReportSchema } from '#tests/support/mutation-report-schema';
import {
  baselineReport,
  patchedReport,
  reportOf,
} from '#tests/support/mutation-reports';
import { strykerReportSchema } from '#verification/infrastructure/mutation/stryker-report.schema';

const ROOT = '/work/acme-widgets';

const INSTALLED = new MutationReportSchema();

describe('strykerReportSchema', () => {
  it.each([
    ['the baseline report', baselineReport(ROOT)],
    ['the patched report', patchedReport(ROOT)],
    [
      'a report with no test',
      reportOf({ projectRoot: ROOT, tests: {}, mutants: [] }),
    ],
  ])('should read %s, which follows the installed schema', (_, text) => {
    const report: unknown = JSON.parse(text);

    expect(INSTALLED.problemsOf(report)).toEqual([]);
    expect(strykerReportSchema.safeParse(report).success).toBe(true);
  });

  it('should refuse what the installed schema refuses', () => {
    const report = JSON.parse(baselineReport(ROOT)) as {
      schemaVersion: string;
      thresholds?: unknown;
      files: Record<
        string,
        {
          mutants: {
            status: string;
            location: { start: { line: number } };
          }[];
        }
      >;
    };
    const [first, second] = report.files['src/price.ts']?.mutants ?? [];
    report.schemaVersion = '3';
    delete report.thresholds;
    if (first !== undefined && second !== undefined) {
      first.status = 'Unknown';
      second.location.start.line = 0;
    }

    expect(INSTALLED.problemsOf(report)).toEqual([
      '$.thresholds is missing',
      '$.schemaVersion does not match ^([1-2])(\\.(([1-9]\\d*)|0)){0,2}$',
      '$.files.src/price.ts.mutants[0].status is none of Killed, Survived, NoCoverage, CompileError, RuntimeError, Timeout, Ignored, Pending',
      '$.files.src/price.ts.mutants[1].location.start.line is below 1',
    ]);
    expect(strykerReportSchema.safeParse(report).success).toBe(false);
  });
});
