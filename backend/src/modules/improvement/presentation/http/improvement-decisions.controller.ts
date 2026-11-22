import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';

import {
  approveImprovementRequestSchema,
  type Improvement,
} from '@coverage-autopilot/api-contracts/improvements';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import {
  emptyBodySchema,
  resourceParamsSchema,
} from '@coverage-autopilot/api-contracts/values';

import { ApproveImprovementHandler } from '#improvement/application/commands/approve-improvement/approve-improvement.handler';
import { CancelImprovementHandler } from '#improvement/application/commands/cancel-improvement/cancel-improvement.handler';
import { AnswerStatus } from '#improvement/presentation/http/answer-status';
import { improvementAnswerOf } from '#improvement/presentation/http/improvement-answers';
import {
  approvalRefusalOf,
  improvementNotFound,
} from '#improvement/presentation/http/improvement-refusals';

/**
 * What a person decides about an improvement: to publish the patch they
 * saw, or to stop the work. Both answer 202, because the work they start
 * runs in jobs after the answer.
 */
@Controller('improvements')
export class ImprovementDecisionsController {
  private readonly approvals: ApproveImprovementHandler;
  private readonly cancels: CancelImprovementHandler;
  private readonly status: AnswerStatus;

  public constructor(
    @Inject(ApproveImprovementHandler) approvals: ApproveImprovementHandler,
    @Inject(CancelImprovementHandler) cancels: CancelImprovementHandler,
    @Inject(AnswerStatus) status: AnswerStatus,
  ) {
    this.approvals = approvals;
    this.cancels = cancels;
    this.status = status;
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.ACCEPTED)
  public async approve(
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<Improvement> {
    const { id } = parseAs(resourceParamsSchema, params);
    const { patchHash } = parseAs(approveImprovementRequestSchema, body);
    const result = await this.approvals.execute({
      improvementId: id,
      patchHash,
    });
    if (result === null) {
      throw improvementNotFound();
    }
    if (result.outcome === 'refused') {
      throw approvalRefusalOf(result);
    }
    return improvementAnswerOf(result.improvement);
  }

  /**
   * One that had ended already answers 200, as it is, so cancelling twice
   * is no error.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  public async cancel(
    @Param() params: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<Improvement> {
    const { id } = parseAs(resourceParamsSchema, params);
    parseAs(emptyBodySchema, body);
    const result = await this.cancels.execute({ improvementId: id });
    if (result === null) {
      throw improvementNotFound();
    }
    if (result.outcome === 'ended') {
      this.status.set(response, HttpStatus.OK);
    }
    return improvementAnswerOf(result.improvement);
  }
}
