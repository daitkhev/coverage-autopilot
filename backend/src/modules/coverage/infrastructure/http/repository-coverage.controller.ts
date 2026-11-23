import {
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import {
  REQUEST_KEY_HEADER,
  requestKeySchema,
} from '@coverage-autopilot/api-contracts/request-key';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';
import type { SnapshotList } from '@coverage-autopilot/api-contracts/snapshots';
import {
  emptyBodySchema,
  resourceParamsSchema,
} from '@coverage-autopilot/api-contracts/values';

import { ScanRepositoryHandler } from '#coverage/application/commands/scan-repository/scan-repository.handler';
import { ListSnapshotsHandler } from '#coverage/application/queries/list-snapshots/list-snapshots.handler';
import { scanAnswerOf } from '#coverage/infrastructure/http/scan-answer';
import { snapshotAnswerOf } from '#coverage/infrastructure/http/snapshot-answer';

const NO_REPOSITORY: ErrorBody = {
  error: 'not_found',
  message: 'No connected repository has this id.',
};

const KEY_REUSED: ErrorBody = {
  error: 'request_key_reused',
  message: 'The request key was used for a scan of another repository.',
};

/**
 * The path and the body of a request to scan. A route takes three
 * parameters at most, and this one also takes its key and its answer.
 */
interface ScanRequestParts {
  readonly params: unknown;
  /** No body says as much as an empty one. */
  readonly body: unknown;
}

/**
 * The coverage of one repository: a scan of it, and the snapshots its
 * scans made. They sit under the path of the repository and belong to
 * this module; the module of repositories serves the repository itself.
 */
@Controller('repositories')
export class RepositoryCoverageController {
  private readonly scanRepository: ScanRepositoryHandler;
  private readonly listSnapshots: ListSnapshotsHandler;
  private readonly adapterHost: HttpAdapterHost;

  public constructor(
    @Inject(ScanRepositoryHandler) scanRepository: ScanRepositoryHandler,
    @Inject(ListSnapshotsHandler) listSnapshots: ListSnapshotsHandler,
    @Inject(HttpAdapterHost) adapterHost: HttpAdapterHost,
  ) {
    this.scanRepository = scanRepository;
    this.listSnapshots = listSnapshots;
    this.adapterHost = adapterHost;
  }

  /** 202 for a scan it queued, 200 for the scan a used key queued. */
  @Post(':id/scans')
  @HttpCode(HttpStatus.ACCEPTED)
  public async scan(
    @Req() request: ScanRequestParts,
    @Headers(REQUEST_KEY_HEADER) key: unknown,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<Scan> {
    const { id } = parseAs(resourceParamsSchema, request.params);
    const requestKey = parseAs(requestKeySchema, key);
    parseAs(emptyBodySchema.optional(), request.body);
    const result = await this.scanRepository.execute({
      repositoryId: id,
      requestKey,
    });
    switch (result.outcome) {
      case 'repository_not_found':
        throw new NotFoundException(NO_REPOSITORY);
      case 'conflict':
        throw new ConflictException(KEY_REUSED);
      case 'existing':
        this.answerWith(response, HttpStatus.OK);
        return scanAnswerOf(result.scan);
      case 'enqueued':
        return scanAnswerOf(result.scan);
    }
  }

  /** The newest first. */
  @Get(':id/snapshots')
  public async snapshots(@Param() params: unknown): Promise<SnapshotList> {
    const { id } = parseAs(resourceParamsSchema, params);
    const snapshots = await this.listSnapshots.execute({ repositoryId: id });
    if (snapshots === null) {
      throw new NotFoundException(NO_REPOSITORY);
    }
    return { items: snapshots.map(snapshotAnswerOf) };
  }

  /**
   * A route that answers with one of two statuses sets the other one
   * here, through the adapter, so no route knows the platform.
   */
  private answerWith(response: unknown, status: HttpStatus): void {
    this.adapterHost.httpAdapter.status(response, status);
  }
}
