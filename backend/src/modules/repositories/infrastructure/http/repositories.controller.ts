import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { ConnectRepositoryHandler } from '#repositories/application/commands/connect-repository/connect-repository.handler';
import { GetRepositoryViewHandler } from '#repositories/application/queries/get-repository-view/get-repository-view.handler';
import { ListRepositoriesHandler } from '#repositories/application/queries/list-repositories/list-repositories.handler';
import { repositoryAnswerOf } from '#repositories/infrastructure/http/repository-answer';

const NO_REPOSITORY: ErrorBody = {
  error: 'not_found',
  message: 'No connected repository has this id.',
};

/** A request whose signal stops the tool it starts. */
interface Stoppable {
  readonly signal: AbortSignal;
}

/**
 * The repositories a person connected, each with what the coverage module
 * knows of it. That knowledge comes through a port of this module, so the
 * routes stay with their resource.
 */
@Controller('repositories')
export class RepositoriesController {
  private readonly connectRepository: ConnectRepositoryHandler;
  private readonly listRepositories: ListRepositoriesHandler;
  private readonly getRepository: GetRepositoryViewHandler;
  private readonly adapterHost: HttpAdapterHost;

  public constructor(
    @Inject(ConnectRepositoryHandler)
    connectRepository: ConnectRepositoryHandler,
    @Inject(ListRepositoriesHandler) listRepositories: ListRepositoriesHandler,
    @Inject(GetRepositoryViewHandler) getRepository: GetRepositoryViewHandler,
    @Inject(HttpAdapterHost) adapterHost: HttpAdapterHost,
  ) {
    this.connectRepository = connectRepository;
    this.listRepositories = listRepositories;
    this.getRepository = getRepository;
    this.adapterHost = adapterHost;
  }

  /**
   * 201 for a new repository, 200 for one connected before. It reads the
   * host, so it stops when its client goes away.
   */
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

  /**
   * A route that answers with one of two statuses sets the other one
   * here, through the adapter, so no route knows the platform.
   */
  private answerWith(response: unknown, status: HttpStatus): void {
    this.adapterHost.httpAdapter.status(response, status);
  }
}
