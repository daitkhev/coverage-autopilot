import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '#kernel/time/clock';
import type { AssessRevisionCommand } from '#repositories/application/commands/assess-revision/assess-revision.command';
import type { RevisionAssessmentDto } from '#repositories/application/contracts/repositories-public-api';
import { HeadRecorder } from '#repositories/application/head-recorder';
import { loadRepository } from '#repositories/application/load-repository';
import { GIT, type Git } from '#repositories/application/ports/git.port';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';
import { RevisionAssessment } from '#repositories/domain/value-objects/revision-assessment.vo';

/**
 * Whether the commit of a snapshot is still good for an improvement of
 * one file. git brings the head and compares, the domain decides, and the
 * head it brought is kept with the repository.
 */
@Injectable()
export class AssessRevisionHandler {
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
    command: AssessRevisionCommand,
    signal: AbortSignal,
  ): Promise<RevisionAssessmentDto> {
    const repository = await loadRepository(
      this.repositories,
      command.repositoryId,
    );
    const facts = await this.git.compareRevisions(
      {
        repositoryId: repository.id,
        url: repository.url,
        branch: repository.defaultBranch,
        snapshotCommit: command.snapshotCommit,
        targetFile: command.targetFile,
      },
      signal,
    );
    const assessment = RevisionAssessment.of(command.snapshotCommit, facts);
    await this.heads.record(repository, {
      commit: assessment.headCommit,
      readAt: this.clock.now(),
    });
    return { outcome: assessment.outcome, headCommit: assessment.headCommit };
  }
}
