import { Controller, Get, Inject, Param, Query } from '@nestjs/common';

import {
  type Improvement,
  type ImprovementList,
  improvementListQuerySchema,
  type ImprovementPatch,
} from '@coverage-autopilot/api-contracts/improvements';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { GetImprovementHandler } from '#improvement/application/queries/get-improvement/get-improvement.handler';
import { GetImprovementPatchHandler } from '#improvement/application/queries/get-improvement-patch/get-improvement-patch.handler';
import { ListImprovementsHandler } from '#improvement/application/queries/list-improvements/list-improvements.handler';
import {
  improvementAnswerOf,
  improvementListAnswerOf,
} from '#improvement/infrastructure/http/improvement-answers';
import {
  improvementNotFound,
  noAcceptedPatch,
} from '#improvement/infrastructure/http/improvement-refusals';

/**
 * What a person reads of improvements: the list, filtered by repository,
 * status and file, one improvement, and the patch it would publish.
 */
@Controller('improvements')
export class ImprovementsController {
  private readonly lists: ListImprovementsHandler;
  private readonly improvements: GetImprovementHandler;
  private readonly patches: GetImprovementPatchHandler;

  public constructor(
    @Inject(ListImprovementsHandler) lists: ListImprovementsHandler,
    @Inject(GetImprovementHandler) improvements: GetImprovementHandler,
    @Inject(GetImprovementPatchHandler) patches: GetImprovementPatchHandler,
  ) {
    this.lists = lists;
    this.improvements = improvements;
    this.patches = patches;
  }

  /** The history of one file is this list, filtered by its path. */
  @Get()
  public async list(@Query() query: unknown): Promise<ImprovementList> {
    const listed = await this.lists.execute(
      parseAs(improvementListQuerySchema, query),
    );
    return improvementListAnswerOf(listed);
  }

  @Get(':id')
  public async get(@Param() params: unknown): Promise<Improvement> {
    const { id } = parseAs(resourceParamsSchema, params);
    const improvement = await this.improvements.execute({ improvementId: id });
    if (improvement === null) {
      throw improvementNotFound();
    }
    return improvementAnswerOf(improvement);
  }

  /** The patch is already in the words of the contract. */
  @Get(':id/patch')
  public async patch(@Param() params: unknown): Promise<ImprovementPatch> {
    const { id } = parseAs(resourceParamsSchema, params);
    const found = await this.patches.execute({ improvementId: id });
    if (found === null) {
      throw improvementNotFound();
    }
    if (found.outcome === 'no_accepted_patch') {
      throw noAcceptedPatch(id);
    }
    return found.patch;
  }
}
