import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';
import {
  emptyBodySchema,
  resourceParamsSchema,
} from '@coverage-autopilot/api-contracts/values';

import { CancelScanHandler } from '#coverage/application/commands/cancel-scan/cancel-scan.handler';
import { GetScanHandler } from '#coverage/application/queries/get-scan/get-scan.handler';
import { scanAnswerOf } from '#coverage/presentation/http/scan-answer';

const NO_SCAN: ErrorBody = {
  error: 'not_found',
  message: 'No scan has this id.',
};

/** One scan: how it stands, and stopping it. */
@Controller('scans')
export class ScansController {
  private readonly getScan: GetScanHandler;
  private readonly cancelScan: CancelScanHandler;

  public constructor(
    @Inject(GetScanHandler) getScan: GetScanHandler,
    @Inject(CancelScanHandler) cancelScan: CancelScanHandler,
  ) {
    this.getScan = getScan;
    this.cancelScan = cancelScan;
  }

  @Get(':id')
  public async get(@Param() params: unknown): Promise<Scan> {
    const { id } = parseAs(resourceParamsSchema, params);
    const scan = await this.getScan.execute({ scanId: id });
    if (scan === null) {
      throw new NotFoundException(NO_SCAN);
    }
    return scanAnswerOf(scan);
  }

  /**
   * 202 with the scan as it stands after the cancel. A scan that ended
   * stays as it ended, so cancelling it again is no error. No body says
   * as much as an empty one.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  public async cancel(
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<Scan> {
    const { id } = parseAs(resourceParamsSchema, params);
    parseAs(emptyBodySchema.optional(), body);
    const scan = await this.cancelScan.execute({ scanId: id });
    if (scan === null) {
      throw new NotFoundException(NO_SCAN);
    }
    return scanAnswerOf(scan);
  }
}
