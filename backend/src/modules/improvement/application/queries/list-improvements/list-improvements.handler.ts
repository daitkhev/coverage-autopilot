import { Inject, Injectable } from '@nestjs/common';

import type { ImprovementListDto } from '#improvement/application/dto/improvement.dto';
import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import type { ListImprovementsQuery } from '#improvement/application/queries/list-improvements/list-improvements.query';
import { requestValueOrNull } from '#improvement/application/request-values';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementFilter,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';

/** The filter of the store, made of values the kernel checked. */
function filterOf(query: ListImprovementsQuery): ImprovementFilter {
  const { repositoryId, status, filePath } = query;
  return {
    ...(repositoryId === undefined
      ? {}
      : { repositoryId: RepositoryId.create(repositoryId) }),
    ...(status === undefined ? {} : { status }),
    ...(filePath === undefined
      ? {}
      : { targetFile: FilePath.create(filePath) }),
  };
}

/**
 * The improvements the query allows, the newest first, as the store keeps
 * them. A filter by a value no improvement can have, such as a repository
 * id that is no UUID, allows none.
 */
@Injectable()
export class ListImprovementsHandler {
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
    query: ListImprovementsQuery,
  ): Promise<ImprovementListDto> {
    const filter = requestValueOrNull(() => filterOf(query));
    const improvements =
      filter === null ? [] : await this.improvements.list(filter);
    return {
      items: await Promise.all(
        improvements.map(async (improvement) => this.views.of(improvement)),
      ),
    };
  }
}
