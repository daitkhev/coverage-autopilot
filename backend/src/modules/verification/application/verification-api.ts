import { Inject, Injectable } from '@nestjs/common';

import { MeasureBaselineHandler } from '#verification/application/commands/measure-baseline/measure-baseline.handler';
import { VerifyPatchHandler } from '#verification/application/commands/verify-patch/verify-patch.handler';
import type {
  MeasureBaselineRequest,
  MeasureBaselineResult,
  VerificationPublicApi,
  VerificationReportDto,
  VerifyPatchRequest,
} from '#verification/application/contracts/verification-public-api';

/** The contract of the module, answered by its two commands. */
@Injectable()
export class VerificationApi implements VerificationPublicApi {
  private readonly baselineHandler: MeasureBaselineHandler;
  private readonly patchHandler: VerifyPatchHandler;

  public constructor(
    @Inject(MeasureBaselineHandler) baselineHandler: MeasureBaselineHandler,
    @Inject(VerifyPatchHandler) patchHandler: VerifyPatchHandler,
  ) {
    this.baselineHandler = baselineHandler;
    this.patchHandler = patchHandler;
  }

  public async measureBaseline(
    request: MeasureBaselineRequest,
    signal: AbortSignal,
  ): Promise<MeasureBaselineResult> {
    return this.baselineHandler.execute(request, signal);
  }

  public async verifyPatch(
    request: VerifyPatchRequest,
    signal: AbortSignal,
  ): Promise<VerificationReportDto> {
    return this.patchHandler.execute(request, signal);
  }
}
