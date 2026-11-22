import { Inject, Injectable } from '@nestjs/common';

import {
  PublicationTargets,
  type Target,
} from '#repositories/application/commands/publish-patch/publication-targets';
import type { PublishPatchCommand } from '#repositories/application/commands/publish-patch/publish-patch.command';
import type { PublishPatchResult } from '#repositories/application/contracts/repositories-public-api';
import { loadRepository } from '#repositories/application/load-repository';
import {
  CODE_HOST,
  type CodeHost,
  type PullRequest,
} from '#repositories/application/ports/code-host.port';
import { GIT, type Git } from '#repositories/application/ports/git.port';
import {
  type PushRequest,
  type PushResult,
  WORKING_COPIES,
  type WorkingCopies,
} from '#repositories/application/ports/working-copies.port';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import {
  REPOSITORY_REPOSITORY,
  type RepositoryRepository,
} from '#repositories/domain/repositories/repository.repository';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';

interface Publication {
  readonly repository: Repository;
  readonly target: Target;
  readonly branch: BranchName;
  readonly command: PublishPatchCommand;
}

function published(
  branch: BranchName,
  pullRequest: PullRequest,
): PublishPatchResult {
  return {
    outcome: 'published',
    branchName: branch.value,
    pullRequestUrl: pullRequest.url,
    pullRequestNumber: pullRequest.number,
  };
}

/** A fork gets the base of the pull request with the tests. */
function pushedBase(publication: Publication): Pick<PushRequest, 'base'> {
  const { target, command } = publication;
  return target.route === 'fork'
    ? { base: { branch: target.base, commit: command.baseCommit } }
    : {};
}

/**
 * Publishes a stored patch as a branch and a pull request, where the
 * targets say: the repository, or a fork in the account. Every step first
 * looks for what an earlier call made, so a call that is repeated after a
 * crash pushes nothing new and opens nothing new. The patch is applied to
 * a clean clone of the base commit made for this alone, never to a folder
 * that a generator or a test run has touched.
 */
@Injectable()
export class PublishPatchHandler {
  private readonly repositories: RepositoryRepository;
  private readonly git: Git;
  private readonly host: CodeHost;
  private readonly copies: WorkingCopies;
  private readonly targets: PublicationTargets;

  public constructor(
    @Inject(REPOSITORY_REPOSITORY) repositories: RepositoryRepository,
    @Inject(GIT) git: Git,
    @Inject(CODE_HOST) host: CodeHost,
    @Inject(WORKING_COPIES) copies: WorkingCopies,
    @Inject(PublicationTargets) targets: PublicationTargets,
  ) {
    this.repositories = repositories;
    this.git = git;
    this.host = host;
    this.copies = copies;
    this.targets = targets;
  }

  public async execute(
    command: PublishPatchCommand,
    signal: AbortSignal,
  ): Promise<PublishPatchResult> {
    const repository = await loadRepository(
      this.repositories,
      command.repositoryId,
    );
    const branch = BranchName.create(command.branchName);
    const found = await this.targets.of(repository, command.baseCommit, signal);
    if (found.outcome === 'refused') {
      return found;
    }
    const publication = { repository, target: found.target, branch, command };
    const earlier = await this.host.findPullRequest(
      { url: found.target.url, branch },
      signal,
    );
    if (earlier !== null) {
      return published(branch, earlier);
    }
    const pushed = await this.pushOnce(publication, signal);
    return pushed.outcome === 'refused'
      ? pushed
      : this.open(publication, signal);
  }

  /** A branch that is on the host already was pushed by an earlier call. */
  private async pushOnce(
    publication: Publication,
    signal: AbortSignal,
  ): Promise<PushResult> {
    const { target, branch } = publication;
    const head = await this.git.readBranchHead(
      { url: target.url, branch },
      signal,
    );
    if (head.outcome === 'refused') {
      return { outcome: 'refused', reason: head.output };
    }
    return head.outcome === 'read'
      ? { outcome: 'pushed' }
      : this.pushFromCleanCopy(publication, signal);
  }

  private async pushFromCleanCopy(
    publication: Publication,
    signal: AbortSignal,
  ): Promise<PushResult> {
    const { repository, target, branch, command } = publication;
    const id = WorkingCopyId.fromPurpose(
      `publish:${repository.id.value}:${branch.value}`,
    );
    await this.copies.create(
      {
        id,
        repositoryId: repository.id,
        url: repository.url,
        branch: repository.defaultBranch,
        commit: command.baseCommit,
      },
      signal,
    );
    try {
      const applied = await this.copies.applyPatch(id, command.patchText);
      return applied.outcome === 'refused'
        ? applied
        : await this.copies.commitAndPush(
            {
              id,
              url: target.url,
              branch,
              commitMessage: command.commitMessage,
              ...pushedBase(publication),
            },
            signal,
          );
    } finally {
      await this.copies.dispose(id);
    }
  }

  private async open(
    publication: Publication,
    signal: AbortSignal,
  ): Promise<PublishPatchResult> {
    const { target, branch, command } = publication;
    const opened = await this.host.openPullRequest(
      {
        url: target.url,
        branch,
        base: target.base,
        title: command.title,
        body: command.body,
      },
      signal,
    );
    return opened.outcome === 'opened'
      ? published(branch, opened.pullRequest)
      : { outcome: 'refused', reason: opened.output };
  }
}
