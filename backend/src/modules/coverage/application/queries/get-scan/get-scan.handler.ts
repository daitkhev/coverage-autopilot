import { Inject, Injectable } from '@nestjs/common';

import type { ScanDto } from '#coverage/application/dto/scan.dto';
import { ScanViews } from '#coverage/application/dto/scan-views';
import type { GetScanQuery } from '#coverage/application/queries/get-scan/get-scan.query';

/**
 * One scan in its own words: how it stands, its moments, the steps while
 * it runs, and its snapshot or its failure once it ended. `null` when no
 * scan has the id, a job of another kind included.
 */
@Injectable()
export class GetScanHandler {
  private readonly views: ScanViews;

  public constructor(@Inject(ScanViews) views: ScanViews) {
    this.views = views;
  }

  public async execute(query: GetScanQuery): Promise<ScanDto | null> {
    return this.views.find(query.scanId);
  }
}
