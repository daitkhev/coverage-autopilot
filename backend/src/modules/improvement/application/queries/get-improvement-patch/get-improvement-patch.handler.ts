import { Inject, Injectable } from '@nestjs/common';

import type {
  GetImprovementPatchQuery,
  ImprovementPatchResult,
} from '#improvement/application/queries/get-improvement-patch/get-improvement-patch.query';
import { requestValueOrNull } from '#improvement/application/request-values';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';

function patchOf(improvement: Improvement): ImprovementPatchResult {
  const accepted = improvement.acceptedAttempt;
  const patch = accepted?.patch ?? null;
  if (accepted === null || patch === null) {
    return { outcome: 'no_accepted_patch' };
  }
  return {
    outcome: 'found',
    patch: {
      improvementId: improvement.id.value,
      attemptNumber: accepted.number,
      patch: patch.text,
      patchHash: patch.hash,
    },
  };
}

/**
 * The patch of the accepted attempt in full, so a person sees exactly
 * what would be published, or `null` when no improvement has the id, also
 * when the id is no id of an improvement at all.
 */
@Injectable()
export class GetImprovementPatchHandler {
  private readonly improvements: ImprovementRepository;

  public constructor(
    @Inject(IMPROVEMENT_REPOSITORY) improvements: ImprovementRepository,
  ) {
    this.improvements = improvements;
  }

  public async execute(
    query: GetImprovementPatchQuery,
  ): Promise<ImprovementPatchResult | null> {
    const id = requestValueOrNull(() =>
      ImprovementId.create(query.improvementId),
    );
    const improvement =
      id === null ? null : await this.improvements.findById(id);
    return improvement === null ? null : patchOf(improvement);
  }
}
