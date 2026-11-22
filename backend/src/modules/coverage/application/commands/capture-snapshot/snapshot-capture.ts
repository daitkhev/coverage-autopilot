import { Inject, Injectable } from '@nestjs/common';

import type { CaptureSnapshotCommand } from '#coverage/application/commands/capture-snapshot/capture-snapshot.command';
import {
  CaptureSteps,
  type ProgressObserver,
} from '#coverage/application/commands/capture-snapshot/capture-steps';
import {
  type Preparation,
  PrepareProjectHandler,
} from '#coverage/application/commands/prepare-project/prepare-project.handler';
import {
  type MeasuredFiles,
  TestExecution,
  type TestRunRecord,
} from '#coverage/application/commands/run-tests/test-execution';
import type { CaptureSnapshotResult } from '#coverage/application/contracts/coverage-public-api';
import { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { CLOCK, type Clock } from '#kernel/time/clock';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/application/contracts/repositories-public-api';

/** A snapshot built and not saved yet, or why there is none. */
export type Capture =
  | { readonly outcome: 'measured'; readonly snapshot: CoverageSnapshot }
  | Exclude<CaptureSnapshotResult, { readonly outcome: 'captured' }>;

interface Measurement {
  readonly command: CaptureSnapshotCommand;
  readonly workingCopyPath: string;
  readonly steps: CaptureSteps;
}

function ignore(): void {
  // A caller that does not watch the steps gives no observer.
}

function refusalOf(
  preparation: Exclude<Preparation, { outcome: 'ready' }>,
): Capture {
  return preparation.outcome === 'unsupported'
    ? preparation
    : {
        outcome: 'install_failed',
        outputReference: preparation.outputReference,
      };
}

/**
 * Clones the commit, installs, runs every test with coverage and builds
 * the snapshot. The working copy is its own and is disposed of on every
 * path: a result, a refusal, a fault and a stop all release it.
 */
@Injectable()
export class SnapshotCapture {
  private readonly repositories: RepositoriesPublicApi;
  private readonly preparation: PrepareProjectHandler;
  private readonly tests: TestExecution;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(PrepareProjectHandler) preparation: PrepareProjectHandler,
    @Inject(TestExecution) tests: TestExecution,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
  ) {
    this.repositories = repositories;
    this.preparation = preparation;
    this.tests = tests;
    this.clock = clock;
    this.ids = ids;
  }

  public async capture(
    command: CaptureSnapshotCommand,
    signal: AbortSignal,
    observer: ProgressObserver = ignore,
  ): Promise<Capture> {
    const steps = new CaptureSteps(observer);
    steps.begin('clone');
    const copy = await this.repositories.createWorkingCopy(
      {
        repositoryId: command.repositoryId,
        commit: command.commit,
        purpose: `snapshot:${command.originKey}`,
      },
      signal,
    );
    try {
      return await this.measure(
        { command, workingCopyPath: copy.path, steps },
        signal,
      );
    } finally {
      await this.repositories.disposeWorkingCopy({ workingCopyId: copy.id });
    }
  }

  private async measure(
    measurement: Measurement,
    signal: AbortSignal,
  ): Promise<Capture> {
    const { command, workingCopyPath, steps } = measurement;
    const owner = command.originKey;
    steps.begin('install');
    const preparation = await this.preparation.execute(
      { workingCopyPath, owner },
      signal,
    );
    if (preparation.outcome !== 'ready') {
      steps.fail();
      return refusalOf(preparation);
    }
    steps.begin('test_run');
    const record = await this.tests.run(
      {
        workingCopyPath,
        owner,
        detection: preparation.detection,
        testFiles: [],
        withCoverage: true,
      },
      signal,
    );
    if (record.output.result.outcome === 'timed_out') {
      steps.fail();
      return {
        outcome: 'test_run_timed_out',
        outputReference: record.outputReference,
      };
    }
    steps.begin('read_report');
    const files = await this.tests.readCoverage(record);
    if (files.reportMissing) {
      steps.fail();
      return {
        outcome: 'coverage_report_missing',
        outputReference: record.outputReference,
      };
    }
    steps.pass();
    return {
      outcome: 'measured',
      snapshot: this.snapshotOf(command, record, files),
    };
  }

  private snapshotOf(
    command: CaptureSnapshotCommand,
    record: TestRunRecord,
    measured: MeasuredFiles,
  ): CoverageSnapshot {
    return CoverageSnapshot.create({
      id: SnapshotId.create(this.ids.generate()),
      repositoryId: command.repositoryId,
      commit: command.commit,
      originKey: command.originKey,
      project: record.detection.project,
      parameters: record.detection.parameters,
      files: measured.files,
      unmeasured: measured.unmeasured,
      testRunOutput: record.outputReference,
      capturedAt: this.clock.now(),
    });
  }
}
