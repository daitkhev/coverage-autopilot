import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '#kernel/time/clock';
import { BaselineMeasurement } from '#verification/application/commands/measure-baseline/baseline-measurement';
import type { MeasureBaselineCommand } from '#verification/application/commands/measure-baseline/measure-baseline.command';
import { Deadline } from '#verification/application/deadline';
import type { MeasureBaselineResult } from '#verification/contracts/verification-public-api';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

function ignore(): void {
  // A caller that does not watch the steps gives no observer.
}

/**
 * Measures a commit once for an improvement. The module stores nothing:
 * the caller keeps the baseline and gives it to every patch.
 */
@Injectable()
export class MeasureBaselineHandler {
  private readonly measurement: BaselineMeasurement;
  private readonly clock: Clock;

  public constructor(
    @Inject(BaselineMeasurement) measurement: BaselineMeasurement,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.measurement = measurement;
    this.clock = clock;
  }

  public async execute(
    command: MeasureBaselineCommand,
    signal: AbortSignal,
  ): Promise<MeasureBaselineResult> {
    return this.measurement.measure(
      {
        command,
        policy: QualityPolicy.create(command.policy),
        deadline: new Deadline(this.clock, command.deadline),
        report: command.onProgress ?? ignore,
      },
      signal,
    );
  }
}
