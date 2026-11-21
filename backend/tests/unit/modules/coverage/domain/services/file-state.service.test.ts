import { describe, expect, it } from 'vitest';

import {
  type FileEvidence,
  fileStateOf,
  type ReportedCoverage,
  type SourceReading,
} from '#coverage/domain/services/file-state.service';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';
import { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import { FilePath } from '#kernel/primitives/file-path';
import { countersOf } from '#tests/support/coverage-snapshots';

const path = FilePath.create('src/a.ts');

const counted: ReportedCoverage = {
  counters: countersOf({ statements: [2, 6], lines: [2, 5] }),
  uncovered: UncoveredCode.create({
    lines: [{ start: 6, end: 8 }],
    branchLines: [],
    functions: [],
  }),
};

const zeroOfZero: ReportedCoverage = {
  counters: CoverageCounters.none(),
  uncovered: UncoveredCode.none(),
};

const MESSAGE = 'Failed to collect coverage from src/a.ts';

function evidence(
  source: SourceReading,
  report: ReportedCoverage | null,
): FileEvidence {
  return { path, source, report, runnerMessage: MESSAGE };
}

const DOES_NOT_PARSE: SourceReading = {
  kind: 'parse_failed',
  message: "')' expected.",
};

describe('fileStateOf', () => {
  describe('when the file does not parse', () => {
    it.each([counted, zeroOfZero, null])(
      'should be unmeasured with parse_failed whatever the report has',
      (report) => {
        expect(fileStateOf(evidence(DOES_NOT_PARSE, report))).toEqual(
          UnmeasuredFile.create({
            path,
            reason: 'parse_failed',
            toolMessage: "')' expected.",
          }),
        );
      },
    );
  });

  describe('when the file holds declarations only', () => {
    it.each([counted, zeroOfZero, null])(
      'should have no executable code whatever the report has',
      (report) => {
        expect(
          fileStateOf(evidence({ kind: 'declarations_only' }, report)),
        ).toEqual(FileCoverage.noExecutableCode(path));
      },
    );
  });

  describe('when the file holds code that runs', () => {
    const code: SourceReading = { kind: 'executable' };

    it('should be measured with the counters of the report', () => {
      expect(fileStateOf(evidence(code, counted))).toEqual(
        FileCoverage.measured({ path, ...counted }),
      );
    });

    it('should be unmeasured with missing_from_report when it has nothing', () => {
      expect(fileStateOf(evidence(code, null))).toEqual(
        UnmeasuredFile.create({
          path,
          reason: 'missing_from_report',
          toolMessage: MESSAGE,
        }),
      );
    });

    it('should be unmeasured with no_counters for zero of zero', () => {
      expect(fileStateOf(evidence(code, zeroOfZero))).toEqual(
        UnmeasuredFile.create({
          path,
          reason: 'no_counters',
          toolMessage: null,
        }),
      );
    });
  });
});
