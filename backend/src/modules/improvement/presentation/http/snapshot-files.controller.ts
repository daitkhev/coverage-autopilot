import { Controller, Get, Inject, Param, Query } from '@nestjs/common';

import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import {
  type SnapshotFiles,
  snapshotFilesQuerySchema,
} from '@coverage-autopilot/api-contracts/snapshots';
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { ListSnapshotFilesHandler } from '#improvement/application/queries/list-snapshot-files/list-snapshot-files.handler';
import { snapshotNotFound } from '#improvement/presentation/http/improvement-refusals';
import { snapshotFilesAnswerOf } from '#improvement/presentation/http/snapshot-file-answers';

/**
 * The files screen: the files of a snapshot with the newest improvement
 * of each. It lives here, not in coverage, because only this module knows
 * the improvements, and coverage does not know this one.
 */
@Controller('snapshots')
export class SnapshotFilesController {
  private readonly files: ListSnapshotFilesHandler;

  public constructor(
    @Inject(ListSnapshotFilesHandler) files: ListSnapshotFilesHandler,
  ) {
    this.files = files;
  }

  @Get(':id/files')
  public async list(
    @Param() params: unknown,
    @Query() query: unknown,
  ): Promise<SnapshotFiles> {
    const { id } = parseAs(resourceParamsSchema, params);
    const files = await this.files.execute({
      ...parseAs(snapshotFilesQuerySchema, query),
      snapshotId: id,
    });
    if (files === null) {
      throw snapshotNotFound();
    }
    return snapshotFilesAnswerOf(files);
  }
}
