import { Inject, Injectable } from '@nestjs/common';

import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type {
  ImprovementStep,
  StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import { publishPatchRequestOf } from '#improvement/application/commands/run-improvement/publication-request';
import { shortened } from '#improvement/application/commands/run-improvement/publication-text';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';
import type { Instant } from '#kernel/time/instant';
import {
  type PublishPatchRequest,
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
  type RevisionAssessmentDto,
} from '#repositories/contracts/repositories-public-api';

/** How publishing ends for the improvement, saved at the moment of the run. */
type Ending = (improvement: Improvement, at: Instant) => void;

/** The outcomes that let a patch made on the snapshot go out. */
const CURRENT: readonly RevisionAssessmentDto['outcome'][] = [
  'current',
  'unchanged',
];

/**
 * What a tool said is kept to a length a person reads. The whole output
 * belongs to the module that ran the tool.
 */
const REASON_MAX_LENGTH = 2000;

function failedWith(failure: ImprovementFailure): Ending {
  return (improvement, at) => {
    improvement.fail(failure, at);
  };
}

function staleSnapshot(
  request: ImprovementRequest,
  assessment: RevisionAssessmentDto,
): Ending {
  const base = request.baseCommit.value;
  const head = assessment.headCommit.value;
  const message =
    assessment.outcome === 'diverged'
      ? `The base commit ${base} is no longer an ancestor of the head ` +
        `${head} of the default branch, so the accepted patch was not ` +
        'published.'
      : `The file ${request.targetFile.value} changed on the default ` +
        `branch between ${base} and ${head}, so the accepted patch was not ` +
        'published.';
  return failedWith(
    ImprovementFailure.create({ reason: 'stale_snapshot', message }),
  );
}

function refused(reason: string): Ending {
  const told = shortened(reason.trim(), REASON_MAX_LENGTH);
  const message =
    told === ''
      ? 'Publishing the patch was refused.'
      : `Publishing the patch was refused: ${told}`;
  return failedWith(
    ImprovementFailure.create({ reason: 'publish_failed', message }),
  );
}

/**
 * Publishes the patch of the accepted attempt as a branch and a pull
 * request, once the snapshot is found still current for the file. It is
 * safe to run again: publishing finds the branch and the pull request it
 * made before and returns them. A stale snapshot or a refusal fails the
 * improvement, and the accepted patch stays stored either way.
 */
@Injectable()
export class PublishingStep implements ImprovementStep {
  public readonly status = 'publishing';
  public readonly faultReason = 'publish_failed';
  private readonly repositories: RepositoriesPublicApi;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
  ) {
    this.repositories = repositories;
  }

  public async run(run: ImprovementRun): Promise<StepResult> {
    const publication = publishPatchRequestOf(run.improvement);
    const ending =
      (await this.staleness(run)) ??
      (await this.published(publication, run.signal));
    await run.save(ending);
    return { next: 'continue' };
  }

  /** `null` while the snapshot is still current for the file. */
  private async staleness(run: ImprovementRun): Promise<Ending | null> {
    const { request } = run.improvement;
    const assessment = await this.repositories.assessRevision(
      {
        repositoryId: request.repositoryId,
        snapshotCommit: request.baseCommit,
        targetFile: request.targetFile,
      },
      run.signal,
    );
    return CURRENT.includes(assessment.outcome)
      ? null
      : staleSnapshot(request, assessment);
  }

  private async published(
    publication: PublishPatchRequest,
    signal: AbortSignal,
  ): Promise<Ending> {
    const result = await this.repositories.publishPatch(publication, signal);
    if (result.outcome === 'refused') {
      return refused(result.reason);
    }
    const pullRequest = PullRequestRef.create({
      number: result.pullRequestNumber,
      url: result.pullRequestUrl,
    });
    return (improvement, at) => {
      improvement.recordPullRequest(pullRequest, at);
    };
  }
}
