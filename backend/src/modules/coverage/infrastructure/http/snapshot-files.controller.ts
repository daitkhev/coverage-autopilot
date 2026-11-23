import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import {
  type SnapshotFiles,
  snapshotFilesQuerySchema,
} from '@coverage-autopilot/api-contracts/snapshots';
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { ListSnapshotFilesHandler } from '#coverage/application/queries/list-snapshot-files/list-snapshot-files.handler';
import { snapshotFilesAnswerOf } from '#coverage/infrastructure/http/snapshot-file-answers';

/** No snapshot has the id of the path, or it is no id of one at all. */
const NO_SNAPSHOT: ErrorBody = {
  error: 'not_found',
  message: 'No snapshot has this id.',
};

/**
 * The files screen: the files of a snapshot with the newest improvement
 * of each. The improvements come through a port of this module, so the
 * route stays with its resource.
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
      throw new NotFoundException(NO_SNAPSHOT);
    }
    return snapshotFilesAnswerOf(files);
  }
}
