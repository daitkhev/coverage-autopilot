import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleInit,
  type Type,
} from '@nestjs/common';

import { CancelScanHandler } from '#coverage/application/commands/cancel-scan/cancel-scan.handler';
import { CaptureSnapshotHandler } from '#coverage/application/commands/capture-snapshot/capture-snapshot.handler';
import { SnapshotCapture } from '#coverage/application/commands/capture-snapshot/snapshot-capture';
import { PrepareProjectHandler } from '#coverage/application/commands/prepare-project/prepare-project.handler';
import { RunScanHandler } from '#coverage/application/commands/run-scan/run-scan.handler';
import { RunTestsHandler } from '#coverage/application/commands/run-tests/run-tests.handler';
import { TestExecution } from '#coverage/application/commands/run-tests/test-execution';
import { ScanRepositoryHandler } from '#coverage/application/commands/scan-repository/scan-repository.handler';
import { COVERAGE_PUBLIC_API } from '#coverage/application/contracts/coverage-public-api';
import { CoverageApi } from '#coverage/application/coverage-api';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { ScanViews } from '#coverage/application/dto/scan-views';
import { TestRunnerUnavailableError } from '#coverage/application/errors/test-runner-unavailable.error';
import { COVERAGE_REPORT_READER } from '#coverage/application/ports/coverage-report-reader.port';
import { PROJECT_DETECTOR } from '#coverage/application/ports/project-detector.port';
import { SOURCE_CLASSIFIER } from '#coverage/application/ports/source-classifier.port';
import {
  TEST_RUNNERS,
  type TestRunner,
} from '#coverage/application/ports/test-runner.port';
import { GetFileCoverageHandler } from '#coverage/application/queries/get-file-coverage/get-file-coverage.handler';
import { GetScanHandler } from '#coverage/application/queries/get-scan/get-scan.handler';
import { GetSnapshotHandler } from '#coverage/application/queries/get-snapshot/get-snapshot.handler';
import { ListSnapshotFilesHandler } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.handler';
import { ListSnapshotsHandler } from '#coverage/application/queries/list-snapshots/list-snapshots.handler';
import { RepositoryCoverageApi } from '#coverage/application/repository-coverage-api';
import { COVERAGE_SNAPSHOT_REPOSITORY } from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { CoverageMetric } from '#coverage/domain/value-objects/coverage-counters.vo';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import { TEST_RUNNER_NAMES } from '#coverage/domain/value-objects/detected-project.vo';
import { TypescriptSourceClassifier } from '#coverage/infrastructure/classification/typescript-source-classifier.adapter';
import { NodeProjectDetector } from '#coverage/infrastructure/detection/node-project-detector.adapter';
import { RepositoryCoverageController } from '#coverage/infrastructure/http/repository-coverage.controller';
import { ScansController } from '#coverage/infrastructure/http/scans.controller';
import { SqliteCoverageSnapshotRepository } from '#coverage/infrastructure/persistence/sqlite-coverage-snapshot.repository';
import { IstanbulReportReader } from '#coverage/infrastructure/reports/istanbul-report-reader.adapter';
import { JEST_COMMAND } from '#coverage/infrastructure/runners/jest-command';
import { SandboxedTestRunner } from '#coverage/infrastructure/runners/sandboxed-test-runner.adapter';
import { VITEST_COMMAND } from '#coverage/infrastructure/runners/vitest-command';
import type { JobHandler } from '#ports/job-handler.port';
import { SANDBOX, type Sandbox } from '#ports/sandbox.port';

/** The settings of the module as plain values, as the root gives them. */
interface CoverageValues extends Omit<CoverageSettings, 'threshold'> {
  readonly threshold: {
    readonly metric: CoverageMetric;
    readonly percentage: number;
  };
}

/**
 * Project detection, test runs with coverage, the reading of reports,
 * snapshots and thresholds, and the routes of scans and of the snapshots
 * of a repository.
 *
 * It takes from the modules around it: the contract of `repositories`,
 * the sandbox, the store of tool output, the queue, the transaction
 * manager, the SQLite connection, the clock, the id generator and the
 * settings of this module, which `register` binds. It gives the queue its
 * handler of scans, and answers the port `REPOSITORY_COVERAGE` of the
 * module below it, so the routes of a repository show what this module
 * knows of it.
 */
@Module({
  controllers: [RepositoryCoverageController, ScansController],
  providers: [
    {
      provide: COVERAGE_SNAPSHOT_REPOSITORY,
      useClass: SqliteCoverageSnapshotRepository,
    },
    { provide: PROJECT_DETECTOR, useClass: NodeProjectDetector },
    { provide: COVERAGE_REPORT_READER, useClass: IstanbulReportReader },
    { provide: SOURCE_CLASSIFIER, useClass: TypescriptSourceClassifier },
    {
      provide: TEST_RUNNERS,
      useFactory: (
        sandbox: Sandbox,
        settings: CoverageSettings,
      ): SandboxedTestRunner[] =>
        [JEST_COMMAND, VITEST_COMMAND].map(
          (command) => new SandboxedTestRunner(command, sandbox, settings),
        ),
      inject: [SANDBOX, COVERAGE_SETTINGS],
    },
    PrepareProjectHandler,
    TestExecution,
    SnapshotCapture,
    CaptureSnapshotHandler,
    RunTestsHandler,
    ScanRepositoryHandler,
    RunScanHandler,
    GetSnapshotHandler,
    GetFileCoverageHandler,
    ListSnapshotFilesHandler,
    ScanViews,
    GetScanHandler,
    CancelScanHandler,
    ListSnapshotsHandler,
    { provide: COVERAGE_PUBLIC_API, useClass: CoverageApi },
    { provide: RepositoryCoverageApi.token, useClass: RepositoryCoverageApi },
  ],
  exports: [COVERAGE_PUBLIC_API, RepositoryCoverageApi.token, RunScanHandler],
})
export class CoverageModule implements OnModuleInit {
  /**
   * The handler of scans, which the module exports. The root gives it to
   * the worker by this class, without reaching into a layer of the module.
   */
  public static readonly jobHandler: Type<JobHandler> = RunScanHandler;

  private readonly runners: readonly TestRunner[];

  public constructor(@Inject(TEST_RUNNERS) runners: readonly TestRunner[]) {
    this.runners = runners;
  }

  /**
   * The module with its settings. It is global, so the modules above it
   * find its contract, the module of repositories the answer to its port,
   * and the root its handler of scans.
   */
  public static register(values: CoverageValues): DynamicModule {
    const settings: CoverageSettings = {
      ...values,
      threshold: CoverageThreshold.create(values.threshold),
    };
    return {
      module: CoverageModule,
      global: true,
      providers: [{ provide: COVERAGE_SETTINGS, useValue: settings }],
    };
  }

  /**
   * Every runner the detector can name has an adapter, or the service does
   * not start: a gap in the wiring would otherwise surface only when the
   * first project of that runner is scanned.
   */
  public onModuleInit(): void {
    const missing = TEST_RUNNER_NAMES.filter(
      (name) => !this.runners.some((runner) => runner.testRunner === name),
    );
    if (missing.length > 0) {
      throw new TestRunnerUnavailableError(
        `No adapter runs ${missing.join(' or ')}, which the detector can name.`,
      );
    }
  }
}
