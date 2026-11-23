import { Inject, Injectable } from '@nestjs/common';

import type { CommitSha } from '#kernel/primitives/commit-sha';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { ResolveHeadCommand } from '#repositories/application/commands/resolve-head/resolve-head.command';
import { HeadNotReadError } from '#repositories/application/errors/head-not-read.error';
import { HeadRecorder } from '#repositories/application/head-recorder';
import { loadRepository } from '#repositories/application/load-repository';
import {
  type BranchHeadResult,
  GIT,
  type Git,
} from '#repositories/application/ports/git.port';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';

function whyNotRead(
  repository: Repository,
  read: Exclude<BranchHeadResult, { readonly outcome: 'read' }>,
): string {
  const name = repository.url.fullName;
  return read.outcome === 'absent'
    ? `${name} has no branch ${repository.defaultBranch.value} any more.`
    : `git could not read the head of ${name}. It said: ${read.output}`;
}

/** Reads the head of the default branch from the host, for a scan. */
@Injectable()
export class ResolveHeadHandler {
  private readonly repositories: RepositoryRepository;
  private readonly git: Git;
  private readonly heads: HeadRecorder;
  private readonly clock: Clock;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(GIT) git: Git,
    @Inject(HeadRecorder) heads: HeadRecorder,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.repositories = repositories;
    this.git = git;
    this.heads = heads;
    this.clock = clock;
  }

  public async execute(
    command: ResolveHeadCommand,
    signal: AbortSignal,
  ): Promise<CommitSha> {
    const repository = await loadRepository(
      this.repositories,
      command.repositoryId,
    );
    const read = await this.git.readBranchHead(
      { url: repository.url, branch: repository.defaultBranch },
      signal,
    );
    if (read.outcome !== 'read') {
      throw new HeadNotReadError(whyNotRead(repository, read));
    }
    await this.heads.record(repository, {
      commit: read.commit,
      readAt: this.clock.now(),
    });
    return read.commit;
  }
}
