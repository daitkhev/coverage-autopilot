import { Injectable } from '@nestjs/common';

import type {
  TestFailure,
  TestOutcomes,
  TestReportReader,
  TestReportRequest,
} from '#coverage/application/ports/test-report-reader.port';
import { rootsOf } from '#coverage/infrastructure/reports/copy-paths';
import { firstFailureOf } from '#coverage/infrastructure/reports/test-failure-excerpt';
import { testOutcomesOf } from '#coverage/infrastructure/reports/test-outcomes';
import {
  type TestReport,
  testReportSchema,
} from '#coverage/infrastructure/reports/test-report.schema';
import { readCopyFile } from '#infrastructure/files/copy-file';

function parsed(text: string): TestReport | null {
  try {
    return testReportSchema.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
}

/** What a reading takes from a report, with the roots of the copy. */
type Reading<Value> = (
  report: TestReport,
  roots: readonly string[],
) => Value | null;

async function readReport<Value>(
  request: TestReportRequest,
  reading: Reading<Value>,
): Promise<Value | null> {
  const file = readCopyFile(request.workingCopyPath, request.reportPath);
  const report = file.outcome === 'read' ? parsed(file.text) : null;
  return Promise.resolve(
    report === null ? null : reading(report, rootsOf(request.workingCopyPath)),
  );
}

/**
 * Reads the JSON report of the tests, as Jest and Vitest write it. The
 * report is written by code of the repository, so it is read as a plain
 * file of the copy or not at all, and a report that is not JSON of that
 * shape names no failure.
 */
@Injectable()
export class JsonTestReportReader implements TestReportReader {
  public async firstFailure(
    request: TestReportRequest,
  ): Promise<TestFailure | null> {
    return readReport(request, firstFailureOf);
  }

  public async outcomes(
    request: TestReportRequest,
  ): Promise<TestOutcomes | null> {
    return readReport(request, testOutcomesOf);
  }
}
