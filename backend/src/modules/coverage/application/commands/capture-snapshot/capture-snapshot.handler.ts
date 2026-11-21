import { Inject, Injectable } from '@nestjs/common';

import type { CaptureSnapshotCommand } from '#coverage/application/commands/capture-snapshot/capture-snapshot.command';
import { SnapshotCapture } from '#coverage/application/commands/capture-snapshot/snapshot-capture';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import { snapshotDtoOf } from '#coverage/application/dto/coverage-dto-mapping';
import type { CaptureSnapshotResult } from '#coverage/contracts/coverage-public-api';
import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import {
  COVERAGE_SNAPSHOT_REPOSITORY,
  type CoverageSnapshotRepository,
} from '#coverage/domain/repositories/coverage-snapshot.repository';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';

/**
 * A snapshot another module asks for, such as the baseline of an
 * improvement. Asked again with the same origin key, it returns the
 * stored snapshot and measures nothing.
 */
@Injectable()
export class CaptureSnapshotHandler {
  private readonly snapshots: CoverageSnapshotRepository;
  private readonly capture: SnapshotCapture;
  private readonly transactions: TransactionManager;
  private readonly settings: CoverageSettings;

  public constructor(
    @Inject(COVERAGE_SNAPSHOT_REPOSITORY) snapshots: CoverageSnapshotRepository,
    @Inject(SnapshotCapture) capture: SnapshotCapture,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(COVERAGE_SETTINGS) settings: CoverageSettings,
  ) {
    this.snapshots = snapshots;
    this.capture = capture;
    this.transactions = transactions;
    this.settings = settings;
  }

  public async execute(
    command: CaptureSnapshotCommand,
    signal: AbortSignal,
  ): Promise<CaptureSnapshotResult> {
    const stored = await this.snapshots.findByOriginKey(command.originKey);
    if (stored !== null) {
      return this.captured(stored);
    }
    const capture = await this.capture.capture(command, signal);
    if (capture.outcome !== 'measured') {
      return capture;
    }
    const saved = await this.transactions.run(async (transaction) =>
      this.snapshots.save(capture.snapshot, transaction),
    );
    return this.captured(saved);
  }

  private captured(snapshot: CoverageSnapshot): CaptureSnapshotResult {
    return {
      outcome: 'captured',
      snapshot: snapshotDtoOf(snapshot, this.settings.threshold),
    };
  }
}
