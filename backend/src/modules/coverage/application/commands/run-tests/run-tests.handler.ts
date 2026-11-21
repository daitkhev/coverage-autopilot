import { Inject, Injectable } from '@nestjs/common';

import type { RunTestsCommand } from '#coverage/application/commands/run-tests/run-tests.command';
import {
  type MeasuredFiles,
  TestExecution,
  type TestRunRecord,
} from '#coverage/application/commands/run-tests/test-execution';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import {
  fileDtoOf,
  parametersDtoOf,
} from '#coverage/application/dto/coverage-dto-mapping';
import {
  PROJECT_DETECTOR,
  type ProjectDetector,
} from '#coverage/application/ports/project-detector.port';
import type {
  RunCoverageDto,
  RunTestsResult,
  TestRunDto,
} from '#coverage/contracts/coverage-public-api';

function testRunDtoOf(record: TestRunRecord): TestRunDto {
  const { result } = record.output;
  const passed = result.exitCode === 0 ? 'passed' : 'failed';
  return {
    status: result.outcome === 'timed_out' ? 'timed_out' : passed,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    outputReference: record.outputReference,
  };
}

/**
 * Runs tests in a working copy another module lends, for the gate of a
 * patch. Nothing is stored: the caller keeps what it needs.
 */
@Injectable()
export class RunTestsHandler {
  private readonly detector: ProjectDetector;
  private readonly tests: TestExecution;
  private readonly settings: CoverageSettings;

  public constructor(
    @Inject(PROJECT_DETECTOR) detector: ProjectDetector,
    @Inject(TestExecution) tests: TestExecution,
    @Inject(COVERAGE_SETTINGS) settings: CoverageSettings,
  ) {
    this.detector = detector;
    this.tests = tests;
    this.settings = settings;
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
      testRun: testRunDtoOf(record),
      coverage: measured === null ? null : this.coverageDtoOf(record, measured),
    };
  }

  private coverageDtoOf(
    record: TestRunRecord,
    measured: MeasuredFiles,
  ): RunCoverageDto {
    const { threshold } = this.settings;
    const files = [...measured.files, ...measured.unmeasured]
      .sort(
        ({ path: left }, { path: right }) =>
          Number(left.value > right.value) - Number(left.value < right.value),
      )
      .map((file) => fileDtoOf(file, threshold));
    return { parameters: parametersDtoOf(record.detection.parameters), files };
  }
}
