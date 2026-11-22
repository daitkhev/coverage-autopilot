import { Inject, Injectable } from '@nestjs/common';

import { AccessProbe } from '#repositories/application/commands/check-access/access-probe';
import type { CheckAccessCommand } from '#repositories/application/commands/check-access/check-access.command';
import { toAccessCheckDto } from '#repositories/application/dto/repository-dtos';
import { HeadRecorder } from '#repositories/application/head-recorder';
import { findRepository } from '#repositories/application/load-repository';
import type { AccessCheckDto } from '#repositories/contracts/repositories-public-api';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

/**
 * The preflight of a repository. A check that got to its last step read
 * the head of the default branch, which the repository keeps, so the list
 * can say it is outdated without asking the host. `null` when no
 * repository has the id.
 */
@Injectable()
export class CheckAccessHandler {
  private readonly repositories: RepositoryRepository;
  private readonly probe: AccessProbe;
  private readonly heads: HeadRecorder;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(AccessProbe) probe: AccessProbe,
    @Inject(HeadRecorder) heads: HeadRecorder,
  ) {
    this.repositories = repositories;
    this.probe = probe;
    this.heads = heads;
  }

  public async execute(
    command: CheckAccessCommand,
    signal: AbortSignal,
  ): Promise<AccessCheckDto | null> {
    const repository = await findRepository(
      this.repositories,
      command.repositoryId,
    );
    if (repository === null) {
      return null;
    }
    const check = await this.probe.run(repository, signal);
    if (check.headCommit !== null) {
      await this.heads.record(repository, {
        commit: check.headCommit,
        readAt: check.checkedAt,
      });
    }
    return toAccessCheckDto(repository.id, check);
  }
}
