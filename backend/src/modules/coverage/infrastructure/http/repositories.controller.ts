import {
  BadRequestException,
  Body,
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
  connectRepositoryRequestSchema,
  type Repository,
  type RepositoryList,
} from '@coverage-autopilot/api-contracts/repositories';
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

import { ConnectRepositoryHandler } from '#coverage/application/commands/connect-repository/connect-repository.handler';
import { ScanRepositoryHandler } from '#coverage/application/commands/scan-repository/scan-repository.handler';
import { GetRepositoryHandler } from '#coverage/application/queries/get-repository/get-repository.handler';
import { ListRepositoriesHandler } from '#coverage/application/queries/list-repositories/list-repositories.handler';
import { ListSnapshotsHandler } from '#coverage/application/queries/list-snapshots/list-snapshots.handler';
import { repositoryAnswerOf } from '#coverage/infrastructure/http/repository-answer';
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

/** A request whose signal stops the tool it starts. */
interface Stoppable {
  readonly signal: AbortSignal;
}

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
 * The repositories, with what the coverage module knows of each, and the
 * scans and snapshots of one. They are here and not in the module of the
 * repositories, because an answer about a repository holds its snapshot
 * and its scan.
 */
@Controller('repositories')
export class RepositoriesController {
  private readonly connectRepository: ConnectRepositoryHandler;
  private readonly listRepositories: ListRepositoriesHandler;
  private readonly getRepository: GetRepositoryHandler;
  private readonly scanRepository: ScanRepositoryHandler;
  private readonly listSnapshots: ListSnapshotsHandler;
  private readonly adapterHost: HttpAdapterHost;

  public constructor(
    @Inject(ConnectRepositoryHandler)
    connectRepository: ConnectRepositoryHandler,
    @Inject(ListRepositoriesHandler) listRepositories: ListRepositoriesHandler,
    @Inject(GetRepositoryHandler) getRepository: GetRepositoryHandler,
    @Inject(ScanRepositoryHandler) scanRepository: ScanRepositoryHandler,
    @Inject(ListSnapshotsHandler) listSnapshots: ListSnapshotsHandler,
    @Inject(HttpAdapterHost) adapterHost: HttpAdapterHost,
  ) {
    this.connectRepository = connectRepository;
    this.listRepositories = listRepositories;
    this.getRepository = getRepository;
    this.scanRepository = scanRepository;
    this.listSnapshots = listSnapshots;
    this.adapterHost = adapterHost;
  }

  /** 201 for a new repository, 200 for one connected before. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async connect(
    @Body() body: unknown,
    @Req() request: Stoppable,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<Repository> {
    const { url } = parseAs(connectRepositoryRequestSchema, body);
    const result = await this.connectRepository.execute(
      { url },
      request.signal,
    );
    switch (result.outcome) {
      case 'invalid_url':
        throw new BadRequestException({
          error: 'invalid_request',
          message: result.reason,
        } satisfies ErrorBody);
      case 'unreachable':
        throw new NotFoundException({
          error: 'not_found',
          message: result.reason,
        } satisfies ErrorBody);
      case 'already_connected':
        this.answerWith(response, HttpStatus.OK);
        return repositoryAnswerOf(result.repository);
      case 'connected':
        return repositoryAnswerOf(result.repository);
    }
  }

  @Get()
  public async list(): Promise<RepositoryList> {
    const repositories = await this.listRepositories.execute();
    return { items: repositories.map(repositoryAnswerOf) };
  }

  @Get(':id')
  public async get(@Param() params: unknown): Promise<Repository> {
    const { id } = parseAs(resourceParamsSchema, params);
    const repository = await this.getRepository.execute({ repositoryId: id });
    if (repository === null) {
      throw new NotFoundException(NO_REPOSITORY);
    }
    return repositoryAnswerOf(repository);
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
