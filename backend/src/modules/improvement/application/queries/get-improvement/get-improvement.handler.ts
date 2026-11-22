import { Inject, Injectable } from '@nestjs/common';

import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';
import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import type { GetImprovementQuery } from '#improvement/application/queries/get-improvement/get-improvement.query';
import { requestValueOrNull } from '#improvement/application/request-values';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';

/**
 * One improvement with its attempts, what it spent, and the steps of the
 * running phase, or `null` when none has the id, also when the id is no
 * id of an improvement at all.
 */
@Injectable()
export class GetImprovementHandler {
  private readonly improvements: ImprovementRepository;
  private readonly views: ImprovementViews;

  public constructor(
    @Inject(IMPROVEMENT_REPOSITORY) improvements: ImprovementRepository,
    @Inject(ImprovementViews) views: ImprovementViews,
  ) {
    this.improvements = improvements;
    this.views = views;
  }

  public async execute(
    query: GetImprovementQuery,
  ): Promise<ImprovementDto | null> {
    const id = requestValueOrNull(() =>
      ImprovementId.create(query.improvementId),
    );
    const improvement =
      id === null ? null : await this.improvements.findById(id);
    return improvement === null ? null : this.views.of(improvement);
  }
}
