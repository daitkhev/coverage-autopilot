import { Inject, Injectable } from '@nestjs/common';

import {
  FILE_IMPROVEMENTS,
  type FileImprovementDto,
  type FileImprovements,
} from '#coverage/application/contracts/file-improvements';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import type { RepositoryId } from '#kernel/primitives/repository-id';

/**
 * What this module knows of the files of a repository, for the port the
 * coverage module declares: the newest improvement of each.
 */
@Injectable()
export class FileImprovementsApi implements FileImprovements {
  /**
   * The token of the port. The module file binds this class to it, and
   * reaches the contract of the module below through this layer only.
   */
  public static readonly token = FILE_IMPROVEMENTS;

  private readonly improvements: ImprovementRepository;

  public constructor(
    @Inject(IMPROVEMENT_REPOSITORY) improvements: ImprovementRepository,
  ) {
    this.improvements = improvements;
  }

  public async latestOf(
    repositoryId: RepositoryId,
  ): Promise<FileImprovementDto[]> {
    const latest = await this.improvements.latestByTarget(repositoryId);
    return latest.map((each) => ({
      path: each.targetFile,
      latest: { id: each.id.value, status: each.status },
    }));
  }
}
