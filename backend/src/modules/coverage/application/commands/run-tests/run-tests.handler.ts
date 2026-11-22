import { Inject, Injectable } from '@nestjs/common';

import type { RunTestsCommand } from '#coverage/application/commands/run-tests/run-tests.command';
import {
  type MeasuredFiles,
  TestExecution,
  type TestRunRecord,
} from '#coverage/application/commands/run-tests/test-execution';
import type {
  RunCoverageDto,
  RunTestsResult,
  TestFailureDto,
  TestOutcomesDto,
  TestRunDto,
} from '#coverage/application/contracts/coverage-public-api';
import {
  parametersDtoOf,
  runFileDtoOf,
} from '#coverage/application/dto/coverage-dto-mapping';
import {
  PROJECT_DETECTOR,
  type ProjectDetector,
} from '#coverage/application/ports/project-detector.port';
import {
  TEST_REPORT_READER,
  type TestReportReader,
  type TestReportRequest,
} from '#coverage/application/ports/test-report-reader.port';

function coverageDtoOf(
  record: TestRunRecord,
  measured: MeasuredFiles,
): RunCoverageDto {
  const files = [...measured.files, ...measured.unmeasured]
    .sort(
      ({ path: left }, { path: right }) =>
        Number(left.value > right.value) - Number(left.value < right.value),
    )
    .map(runFileDtoOf);
  return { parameters: parametersDtoOf(record.detection.parameters), files };
}

function reportOf(record: TestRunRecord): TestReportRequest {
  return {
    workingCopyPath: record.workingCopyPath,
    reportPath: record.output.resultsPath,
  };
}

function statusOf(record: TestRunRecord): TestRunDto['status'] {
  const { result } = record.output;
  const passed = result.exitCode === 0 ? 'passed' : 'failed';
  return result.outcome === 'timed_out' ? 'timed_out' : passed;
}

/**
 * Runs tests in a working copy another module lends, for the gate of a
 * patch. Nothing is stored: the caller keeps what it needs. The files are
 * judged by no threshold, since the copy names no repository. A run that
 * failed tells its first failure, so the next attempt can learn from it.
 */
@Injectable()
export class RunTestsHandler {
  private readonly detector: ProjectDetector;
  private readonly tests: TestExecution;
  private readonly reports: TestReportReader;

  public constructor(
    @Inject(PROJECT_DETECTOR) detector: ProjectDetector,
    @Inject(TestExecution) tests: TestExecution,
    @Inject(TEST_REPORT_READER) reports: TestReportReader,
  ) {
    this.detector = detector;
    this.tests = tests;
    this.reports = reports;
  }

  public async execute(
    command: RunTestsCommand,
    signal: AbortSignal,
  ): Promise<RunTestsResult> {
    const detection = await this.detector.detect(command.workingCopyPath);
    if (detection.outcome === 'unsupported') {
      return detection;
    }
    const record = await this.tests.run({ ...command, detection }, signal);
    const measured =
      command.withCoverage && record.output.result.outcome === 'exited'
        ? await this.tests.readCoverage(record)
        : null;
    return {
      outcome: 'completed',
      testRun: await this.testRunDtoOf(record),
      coverage: measured === null ? null : coverageDtoOf(record, measured),
    };
  }

  private async testRunDtoOf(record: TestRunRecord): Promise<TestRunDto> {
    const { result } = record.output;
    const status = statusOf(record);
    return {
      status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      outputReference: record.outputReference,
      firstFailure: status === 'failed' ? await this.failureOf(record) : null,
      outcomes: status === 'timed_out' ? null : await this.outcomesOf(record),
    };
  }

  private async failureOf(
    record: TestRunRecord,
  ): Promise<TestFailureDto | null> {
    return this.reports.firstFailure(reportOf(record));
  }

  /** A run stopped at its time limit wrote no whole report. */
  private async outcomesOf(
    record: TestRunRecord,
  ): Promise<TestOutcomesDto | null> {
    return this.reports.outcomes(reportOf(record));
  }
}
