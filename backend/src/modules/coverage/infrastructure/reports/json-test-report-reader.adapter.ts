import { Injectable } from '@nestjs/common';

import type {
  TestFailure,
  TestReportReader,
  TestReportRequest,
} from '#coverage/application/ports/test-report-reader.port';
import { rootsOf } from '#coverage/infrastructure/reports/copy-paths';
import { firstFailureOf } from '#coverage/infrastructure/reports/test-failure-excerpt';
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
    const file = readCopyFile(request.workingCopyPath, request.reportPath);
    const report = file.outcome === 'read' ? parsed(file.text) : null;
    return Promise.resolve(
      report === null
        ? null
        : firstFailureOf(report, rootsOf(request.workingCopyPath)),
    );
  }
}
