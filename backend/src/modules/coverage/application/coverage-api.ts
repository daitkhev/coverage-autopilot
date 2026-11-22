import { Inject, Injectable } from '@nestjs/common';

import { CaptureSnapshotHandler } from '#coverage/application/commands/capture-snapshot/capture-snapshot.handler';
import { PrepareProjectHandler } from '#coverage/application/commands/prepare-project/prepare-project.handler';
import { RunTestsHandler } from '#coverage/application/commands/run-tests/run-tests.handler';
import type {
  CaptureSnapshotRequest,
  CaptureSnapshotResult,
  CoveragePublicApi,
  CoverageSnapshotDto,
  FileCoverageDto,
  FileCoverageRequest,
  PrepareProjectResult,
  RunTestsRequest,
  RunTestsResult,
  SnapshotRequest,
  WorkingCopyLoan,
} from '#coverage/application/contracts/coverage-public-api';
import {
  parametersDtoOf,
  projectDtoOf,
} from '#coverage/application/dto/coverage-dto-mapping';
import { GetFileCoverageHandler } from '#coverage/application/queries/get-file-coverage/get-file-coverage.handler';
import { GetSnapshotHandler } from '#coverage/application/queries/get-snapshot/get-snapshot.handler';

/** The contract of the module, answered by its commands and queries. */
@Injectable()
export class CoverageApi implements CoveragePublicApi {
  private readonly captureHandler: CaptureSnapshotHandler;
  private readonly prepareHandler: PrepareProjectHandler;
  private readonly runTestsHandler: RunTestsHandler;
  private readonly snapshotHandler: GetSnapshotHandler;
  private readonly fileHandler: GetFileCoverageHandler;

  public constructor(
    @Inject(CaptureSnapshotHandler) captureHandler: CaptureSnapshotHandler,
    @Inject(PrepareProjectHandler) prepareHandler: PrepareProjectHandler,
    @Inject(RunTestsHandler) runTestsHandler: RunTestsHandler,
    @Inject(GetSnapshotHandler) snapshotHandler: GetSnapshotHandler,
    @Inject(GetFileCoverageHandler) fileHandler: GetFileCoverageHandler,
  ) {
    this.captureHandler = captureHandler;
    this.prepareHandler = prepareHandler;
    this.runTestsHandler = runTestsHandler;
    this.snapshotHandler = snapshotHandler;
    this.fileHandler = fileHandler;
  }

  public async captureSnapshot(
    request: CaptureSnapshotRequest,
    signal: AbortSignal,
  ): Promise<CaptureSnapshotResult> {
    return this.captureHandler.execute(request, signal);
  }

  public async prepareProject(
    request: WorkingCopyLoan,
    signal: AbortSignal,
  ): Promise<PrepareProjectResult> {
    const preparation = await this.prepareHandler.execute(request, signal);
    if (preparation.outcome !== 'ready') {
      return preparation;
    }
    const { project, parameters } = preparation.detection;
    return {
      outcome: 'ready',
      project: projectDtoOf(project),
      parameters: parametersDtoOf(parameters),
    };
  }

  public async runTests(
    request: RunTestsRequest,
    signal: AbortSignal,
  ): Promise<RunTestsResult> {
    return this.runTestsHandler.execute(request, signal);
  }

  public async getSnapshot(
    request: SnapshotRequest,
  ): Promise<CoverageSnapshotDto | null> {
    return this.snapshotHandler.execute(request);
  }

  public async getFileCoverage(
    request: FileCoverageRequest,
  ): Promise<FileCoverageDto | null> {
    return this.fileHandler.execute(request);
  }
}
