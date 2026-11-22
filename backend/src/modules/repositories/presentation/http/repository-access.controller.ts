import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
} from '@nestjs/common';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { CheckAccessHandler } from '#repositories/application/commands/check-access/check-access.handler';
import { accessCheckAnswerOf } from '#repositories/presentation/http/access-check-answer';

const NO_REPOSITORY: ErrorBody = {
  error: 'not_found',
  message: 'No connected repository has this id.',
};

/**
 * The preflight of a repository. It runs git and gh, so it stops when its
 * client goes away.
 */
@Controller('repositories')
export class RepositoryAccessController {
  private readonly checkAccess: CheckAccessHandler;

  public constructor(
    @Inject(CheckAccessHandler) checkAccess: CheckAccessHandler,
  ) {
    this.checkAccess = checkAccess;
  }

  @Get(':id/access')
  public async check(
    @Param() params: unknown,
    @Req() request: { readonly signal: AbortSignal },
  ): Promise<AccessCheck> {
    const { id } = parseAs(resourceParamsSchema, params);
    const check = await this.checkAccess.execute(
      { repositoryId: id },
      request.signal,
    );
    if (check === null) {
      throw new NotFoundException(NO_REPOSITORY);
    }
    return accessCheckAnswerOf(check);
  }
}
