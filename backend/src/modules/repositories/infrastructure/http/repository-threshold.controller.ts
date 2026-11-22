import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import {
  changeThresholdRequestSchema,
  type Repository,
} from '@coverage-autopilot/api-contracts/repositories';
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { ChangeThresholdHandler } from '#repositories/application/commands/change-threshold/change-threshold.handler';
import { repositoryAnswerOf } from '#repositories/infrastructure/http/repository-answer';

const NO_REPOSITORY: ErrorBody = {
  error: 'not_found',
  message: 'No connected repository has this id.',
};

/**
 * The threshold a person gives one repository, which its files are
 * judged by in place of the default of the service.
 */
@Controller('repositories')
export class RepositoryThresholdController {
  private readonly changeThreshold: ChangeThresholdHandler;

  public constructor(
    @Inject(ChangeThresholdHandler) changeThreshold: ChangeThresholdHandler,
  ) {
    this.changeThreshold = changeThreshold;
  }

  /**
   * 200 with the repository as its files are judged from now on. A
   * percentage of `null` gives it the default of the service back.
   */
  @Post(':id/threshold')
  @HttpCode(HttpStatus.OK)
  public async change(
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<Repository> {
    const { id } = parseAs(resourceParamsSchema, params);
    const { percentage } = parseAs(changeThresholdRequestSchema, body);
    const repository = await this.changeThreshold.execute({
      repositoryId: id,
      percentage,
    });
    if (repository === null) {
      throw new NotFoundException(NO_REPOSITORY);
    }
    return repositoryAnswerOf(repository);
  }
}
