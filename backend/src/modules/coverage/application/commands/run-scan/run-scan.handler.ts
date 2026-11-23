import { Inject, Injectable } from '@nestjs/common';

import {
  type Capture,
  SnapshotCapture,
} from '#coverage/application/commands/capture-snapshot/snapshot-capture';
import {
  SCAN_OUTCOME_VERSION,
  type ScanOutcome,
} from '#coverage/application/commands/run-scan/scan-outcome';
import { SCAN_PAYLOAD_VERSION } from '#coverage/application/commands/scan-repository/scan-repository.command';
import { UnknownScanPayloadError } from '#coverage/application/errors/unknown-scan-payload.error';
import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import { ApplicationError } from '#kernel/errors/application.error';
import { DomainError } from '#kernel/errors/domain.error';
import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import { RepositoryId } from '#kernel/primitives/repository-id';
import type {
  JobContext,
  JobHandler,
  JobResult,
} from '#ports/job-handler.port';
import type { JobDocument } from '#ports/job-queue.port';
import { LOGGER, type Logger } from '#ports/logger.port';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/application/contracts/repositories-public-api';

type Fault = DomainError | ApplicationError | InfrastructureError;

function isFault(error: unknown): error is Fault {
  return (
    error instanceof DomainError ||
    error instanceof ApplicationError ||
    error instanceof InfrastructureError
  );
}

/** A job left in the queue by a newer service cannot be read here. */
function checkPayload(payload: JobDocument): void {
  if (payload.version !== SCAN_PAYLOAD_VERSION) {
    throw new UnknownScanPayloadError(
      `A scan job has the payload version ${String(payload.version)}, and ` +
        `this service reads the version ${String(SCAN_PAYLOAD_VERSION)}.`,
    );
  }
}

function captured(snapshot: CoverageSnapshot): ScanOutcome {
  return {
    version: SCAN_OUTCOME_VERSION,
    outcome: 'captured',
    snapshotId: snapshot.id.value,
  };
}

function refusedOutcome(
  capture: Exclude<Capture, { outcome: 'measured' }>,
): ScanOutcome {
  return capture.outcome === 'unsupported'
    ? {
        version: SCAN_OUTCOME_VERSION,
        outcome: 'unsupported_project',
        reason: capture.reason,
        detail: capture.detail,
      }
    : {
        version: SCAN_OUTCOME_VERSION,
        outcome: capture.outcome,
        outputReference: capture.outputReference,
      };
}

/**
 * A stop is the worker's to handle, and so is an error the code does not
 * know. A typed fault that may pass is retried; one that will not ends
 * the scan with its code.
 */
function answerTo(error: unknown, signal: AbortSignal): JobResult {
  if (signal.aborted || !isFault(error)) {
    throw error;
  }
  const { code, message } = error;
  if (error.retryable) {
    return { status: 'retry', reason: { code, message } };
  }
  const failed: ScanOutcome = {
    version: SCAN_OUTCOME_VERSION,
    outcome: 'failed',
    code,
    message,
  };
  return { status: 'finished', outcome: failed };
}

/**
 * Runs a scan job: resolves the head, measures it in a working copy of
 * its own, and saves the snapshot under the origin key of the job. Run
 * again after a crash, it finds that snapshot and measures nothing.
 */
@Injectable()
export class RunScanHandler implements JobHandler {
  public readonly kind = 'scan';
  private readonly repositories: RepositoriesPublicApi;
  private readonly snapshots: CoverageSnapshotRepository;
  private readonly capture: SnapshotCapture;
  private readonly logger: Logger;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(SnapshotCapture) capture: SnapshotCapture,
    @Inject(LOGGER) logger: Logger,
  ) {
    this.repositories = repositories;
    this.snapshots = snapshots;
    this.capture = capture;
    this.logger = logger.child({ component: 'scan' });
  }

  public async execute(context: JobContext): Promise<JobResult> {
    try {
      return { status: 'finished', outcome: await this.scan(context) };
    } catch (error) {
      return answerTo(error, context.signal);
    }
  }

  /**
   * A scan has no state beside its job: the dead job is the failed scan,
   * and a snapshot it saved before stays as it is.
   */
  public async onRetriesExhausted(): Promise<void> {
    return Promise.resolve();
  }

  private async scan(context: JobContext): Promise<ScanOutcome> {
    checkPayload(context.payload);
    const originKey = `scan:${context.jobId}`;
    const stored = await this.snapshots.findByOriginKey(originKey);
    if (stored !== null) {
      return captured(stored);
    }
    const repositoryId = RepositoryId.create(context.subjectId);
    if ((await this.repositories.getRepository({ repositoryId })) === null) {
      return {
        version: SCAN_OUTCOME_VERSION,
        outcome: 'repository_not_found',
      };
    }
    const commit = await this.repositories.resolveHead(
      { repositoryId },
      context.signal,
    );
    const capture = await this.capture.capture(
      { repositoryId, commit, originKey },
      context.signal,
      {
        progress: (progress) => {
          context.reportProgress(progress);
        },
        log: this.logger.child({
          jobId: context.jobId,
          repositoryId: repositoryId.value,
        }),
      },
    );
    if (capture.outcome !== 'measured') {
      return refusedOutcome(capture);
    }
    const saved = await context.commit(async (transaction) =>
      this.snapshots.save(capture.snapshot, transaction),
    );
    return captured(saved);
  }
}
