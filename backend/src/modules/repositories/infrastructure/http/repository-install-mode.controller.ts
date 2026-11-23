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
  changeInstallModeRequestSchema,
  type Repository,
} from '@coverage-autopilot/api-contracts/repositories';
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { ChangeInstallModeHandler } from '#repositories/application/commands/change-install-mode/change-install-mode.handler';
import { repositoryAnswerOf } from '#repositories/infrastructure/http/repository-answer';

const NO_REPOSITORY: ErrorBody = {
  error: 'not_found',
  message: 'No connected repository has this id.',
};

/**
 * The mode of install a person gives one repository, which its copies
 * are installed by in place of the default of the service.
 */
@Controller('repositories')
export class RepositoryInstallModeController {
  private readonly changeInstallMode: ChangeInstallModeHandler;

  public constructor(
    @Inject(ChangeInstallModeHandler)
    changeInstallMode: ChangeInstallModeHandler,
  ) {
    this.changeInstallMode = changeInstallMode;
  }

  /**
   * 200 with the repository as its next copy is installed. A mode of
   * `null` gives it the default of the service back.
   */
  @Post(':id/install-mode')
  @HttpCode(HttpStatus.OK)
  public async change(
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<Repository> {
    const { id } = parseAs(resourceParamsSchema, params);
    const { mode } = parseAs(changeInstallModeRequestSchema, body);
    const repository = await this.changeInstallMode.execute({
      repositoryId: id,
      mode,
    });
    if (repository === null) {
      throw new NotFoundException(NO_REPOSITORY);
    }
    return repositoryAnswerOf(repository);
  }
}
