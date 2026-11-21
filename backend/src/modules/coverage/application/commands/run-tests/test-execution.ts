import { Inject, Injectable } from '@nestjs/common';

import type { RunTestsCommand } from '#coverage/application/commands/run-tests/run-tests.command';
import { TestRunnerUnavailableError } from '#coverage/application/errors/test-runner-unavailable.error';
import {
  COVERAGE_REPORT_READER,
  type CoverageReport,
  type CoverageReportReader,
} from '#coverage/application/ports/coverage-report-reader.port';
import type { SupportedProject } from '#coverage/application/ports/project-detector.port';
import {
  SOURCE_CLASSIFIER,
  type SourceClassifier,
} from '#coverage/application/ports/source-classifier.port';
import {
  TEST_RUNNERS,
  type TestRunner,
  type TestRunOutput,
} from '#coverage/application/ports/test-runner.port';
import {
  fileStateOf,
  type SourceReading,
} from '#coverage/domain/services/file-state.service';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import { ARTIFACT_STORE, type ArtifactStore } from '#ports/artifact-store.port';

export interface TestExecutionRequest extends RunTestsCommand {
  readonly detection: SupportedProject;
}

interface ReadSource {
  readonly path: FilePath;
  readonly reading: SourceReading;
}

/** A run that happened, with what is needed to read its coverage. */
export interface TestRunRecord {
  readonly workingCopyPath: string;
  readonly detection: SupportedProject;
  /** Every eligible file as the parser read it, or none without coverage. */
  readonly sources: readonly ReadSource[];
  readonly output: TestRunOutput;
  /** The raw output of the run in the artifact store. */
  readonly outputReference: string;
}

/** Every eligible file in exactly one state. */
export interface MeasuredFiles {
  readonly files: readonly FileCoverage[];
  readonly unmeasured: readonly UnmeasuredFile[];
}

/** The first line of the output that names the file, as the runner said it. */
function lineAbout(output: string, path: FilePath): string | null {
  const line = output.split('\n').find((text) => text.includes(path.value));
  return line?.trim() ?? null;
}

/**
 * A run of the tests and the reading of its coverage, the two halves a
 * snapshot and a lent test run share. The runner is given the files that
 * parse and hold code that runs. The report is then compared with the
 * whole list, so a file the runner dropped or faked still gets a state.
 */
@Injectable()
export class TestExecution {
  private readonly classifier: SourceClassifier;
  private readonly runners: readonly TestRunner[];
  private readonly reader: CoverageReportReader;
  private readonly artifacts: ArtifactStore;

  public constructor(
    @Inject(SOURCE_CLASSIFIER) classifier: SourceClassifier,
    @Inject(TEST_RUNNERS) runners: readonly TestRunner[],
    @Inject(COVERAGE_REPORT_READER) reader: CoverageReportReader,
    @Inject(ARTIFACT_STORE) artifacts: ArtifactStore,
  ) {
    this.classifier = classifier;
    this.runners = runners;
    this.reader = reader;
    this.artifacts = artifacts;
  }

  public async run(
    request: TestExecutionRequest,
    signal: AbortSignal,
  ): Promise<TestRunRecord> {
    const { workingCopyPath, detection } = request;
    const sources = request.withCoverage
      ? await this.readSources(request, signal)
      : [];
    const output = await this.runnerOf(detection).run(
      {
        workingCopyPath,
        project: detection.project,
        parameters: detection.parameters,
        testFiles: request.testFiles,
        coverageFiles: request.withCoverage ? withCode(sources) : null,
      },
      signal,
    );
    const outputReference = await this.artifacts.save({
      owner: request.owner,
      label: 'test-run',
      content: output.result.output,
    });
    return { workingCopyPath, detection, sources, output, outputReference };
  }

  public async readCoverage(record: TestRunRecord): Promise<MeasuredFiles> {
    const { reportPath, result } = record.output;
    const report: CoverageReport | null =
      reportPath === null
        ? null
        : await this.reader.read({
            workingCopyPath: record.workingCopyPath,
            reportPath,
          });
    const states = record.sources.map(({ path, reading }) =>
      fileStateOf({
        path,
        source: reading,
        report: report?.get(path.value) ?? null,
        runnerMessage: lineAbout(result.output, path),
      }),
    );
    return {
      files: states.filter((state) => state instanceof FileCoverage),
      unmeasured: states.filter((state) => state instanceof UnmeasuredFile),
    };
  }

  private async readSources(
    request: TestExecutionRequest,
    signal: AbortSignal,
  ): Promise<ReadSource[]> {
    const sources: ReadSource[] = [];
    for (const path of request.detection.eligibleFiles) {
      signal.throwIfAborted();
      const reading = await this.classifier.classify({
        workingCopyPath: request.workingCopyPath,
        path,
      });
      sources.push({ path, reading });
    }
    return sources;
  }

  private runnerOf(detection: SupportedProject): TestRunner {
    const name = detection.project.testRunner;
    const runner = this.runners.find((each) => each.testRunner === name);
    if (runner === undefined) {
      throw new TestRunnerUnavailableError(
        `No adapter runs ${name}, which the project uses.`,
      );
    }
    return runner;
  }
}

function withCode(sources: readonly ReadSource[]): FilePath[] {
  return sources
    .filter(({ reading }) => reading.kind === 'executable')
    .map(({ path }) => path);
}
