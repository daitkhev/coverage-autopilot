import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { CancelScanHandler } from '#coverage/application/commands/cancel-scan/cancel-scan.handler';
import { CaptureSnapshotHandler } from '#coverage/application/commands/capture-snapshot/capture-snapshot.handler';
import { SnapshotCapture } from '#coverage/application/commands/capture-snapshot/snapshot-capture';
import { ConnectRepositoryHandler } from '#coverage/application/commands/connect-repository/connect-repository.handler';
import { PrepareProjectHandler } from '#coverage/application/commands/prepare-project/prepare-project.handler';
import { RunScanHandler } from '#coverage/application/commands/run-scan/run-scan.handler';
import { RunTestsHandler } from '#coverage/application/commands/run-tests/run-tests.handler';
import { TestExecution } from '#coverage/application/commands/run-tests/test-execution';
import { ScanRepositoryHandler } from '#coverage/application/commands/scan-repository/scan-repository.handler';
import { CoverageApi } from '#coverage/application/coverage-api';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { RepositoryViews } from '#coverage/application/dto/repository-views';
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
import { GetRepositoryHandler } from '#coverage/application/queries/get-repository/get-repository.handler';
import { GetScanHandler } from '#coverage/application/queries/get-scan/get-scan.handler';
import { GetSnapshotHandler } from '#coverage/application/queries/get-snapshot/get-snapshot.handler';
import { ListRepositoriesHandler } from '#coverage/application/queries/list-repositories/list-repositories.handler';
import { ListSnapshotFilesHandler } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.handler';
import { ListSnapshotsHandler } from '#coverage/application/queries/list-snapshots/list-snapshots.handler';
import { COVERAGE_PUBLIC_API } from '#coverage/contracts/coverage-public-api';
import { COVERAGE_SNAPSHOT_REPOSITORY } from '#coverage/domain/repositories/coverage-snapshot.repository';
import { TEST_RUNNER_NAMES } from '#coverage/domain/value-objects/detected-project.vo';
import { TypescriptSourceClassifier } from '#coverage/infrastructure/classification/typescript-source-classifier.adapter';
import { NodeProjectDetector } from '#coverage/infrastructure/detection/node-project-detector.adapter';
import { SqliteCoverageSnapshotRepository } from '#coverage/infrastructure/persistence/sqlite-coverage-snapshot.repository';
import { IstanbulReportReader } from '#coverage/infrastructure/reports/istanbul-report-reader.adapter';
import { JEST_COMMAND } from '#coverage/infrastructure/runners/jest-command';
import { SandboxedTestRunner } from '#coverage/infrastructure/runners/sandboxed-test-runner.adapter';
import { VITEST_COMMAND } from '#coverage/infrastructure/runners/vitest-command';
import { RepositoriesController } from '#coverage/presentation/http/repositories.controller';
import { ScansController } from '#coverage/presentation/http/scans.controller';
import { SANDBOX, type Sandbox } from '#ports/sandbox.port';

/**
 * Project detection, test runs with coverage, the reading of reports,
 * snapshots and thresholds, and the routes of repositories and scans: an
 * answer about a repository holds what only this module knows of it.
 *
 * It takes from the modules around it: both contracts of `repositories`,
 * the sandbox, the store of tool output, the queue, the transaction
 * manager, the SQLite connection, the clock, the id generator and the
 * settings of this module. It gives the queue its handler of scans.
 */
@Module({
  controllers: [RepositoriesController, ScansController],
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
    RepositoryViews,
    ConnectRepositoryHandler,
    GetRepositoryHandler,
    ListRepositoriesHandler,
    { provide: COVERAGE_PUBLIC_API, useClass: CoverageApi },
  ],
  exports: [COVERAGE_PUBLIC_API, RunScanHandler],
})
export class CoverageModule implements OnModuleInit {
  private readonly runners: readonly TestRunner[];

  public constructor(@Inject(TEST_RUNNERS) runners: readonly TestRunner[]) {
    this.runners = runners;
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
