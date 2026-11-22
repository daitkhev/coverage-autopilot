import { Inject, Injectable } from '@nestjs/common';

import type { CreateWorkingCopyCommand } from '#repositories/application/commands/create-working-copy/create-working-copy.command';
import type { WorkingCopyDto } from '#repositories/application/contracts/repositories-public-api';
import { loadRepository } from '#repositories/application/load-repository';
import {
  WORKING_COPIES,
  type WorkingCopies,
} from '#repositories/application/ports/working-copies.port';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';
import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';

/**
 * A clean clone at one commit, for the module that asks. That module owns
 * it and disposes of it, and the id is all it needs to keep.
 */
@Injectable()
export class CreateWorkingCopyHandler {
  private readonly repositories: RepositoryRepository;
  private readonly copies: WorkingCopies;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(WORKING_COPIES) copies: WorkingCopies,
  ) {
    this.repositories = repositories;
    this.copies = copies;
  }

  public async execute(
    command: CreateWorkingCopyCommand,
    signal: AbortSignal,
  ): Promise<WorkingCopyDto> {
    const repository = await loadRepository(
      this.repositories,
      command.repositoryId,
    );
    const id = WorkingCopyId.fromPurpose(command.purpose);
    const path = await this.copies.create(
      {
        id,
        repositoryId: repository.id,
        url: repository.url,
        branch: repository.defaultBranch,
        commit: command.commit,
      },
      signal,
    );
    return {
      id: id.value,
      repositoryId: repository.id,
      commit: command.commit,
      path,
    };
  }
}
