import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
  type CoverageSnapshotDto,
} from '#coverage/contracts/coverage-public-api';
import {
  captureEnding,
  measureEnding,
  revisionEnding,
  targetEnding,
} from '#improvement/application/commands/run-improvement/analysis-endings';
import { AnalysisProgress } from '#improvement/application/commands/run-improvement/analysis-progress';
import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type {
  ImprovementStep,
  StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import type { Change } from '#improvement/application/commands/run-improvement/run-failures';
import { MissingDeadlineError } from '#improvement/application/errors/missing-deadline.error';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/contracts/repositories-public-api';
import {
  type MeasureBaselineRequest,
  VERIFICATION_PUBLIC_API,
  type VerificationPublicApi,
} from '#verification/contracts/verification-public-api';

function recordedSnapshot(snapshot: CoverageSnapshotDto): Change {
  const id = SnapshotId.create(snapshot.id);
  return (improvement, at) => {
    improvement.recordBaselineSnapshot({ id, commit: snapshot.commit }, at);
  };
}

function baselineRequestOf(
  run: ImprovementRun,
  progress: AnalysisProgress,
): MeasureBaselineRequest {
  const { request, deadlineAt } = run.improvement;
  if (deadlineAt === null) {
    throw new MissingDeadlineError(
      `The improvement ${run.improvement.id.value} analyzes without a ` +
        'deadline, which its work starts with.',
    );
  }
  const { requiredChecks, repeatedRuns, mutationThreshold } = request.policy;
  return {
    repositoryId: request.repositoryId,
    commit: request.baseCommit,
    targetFile: request.targetFile,
    policy: { requiredChecks, repeatedRuns, mutationThreshold },
    deadline: deadlineAt,
    owner: run.owner,
    onProgress: (step) => {
      progress.hear(step);
    },
  };
}

/**
 * The work of `analyzing`: checks that the commit of the request is still
 * current for the file, measures it again in a fresh snapshot, and asks
 * the gate for its baseline. It ends by starting generation, or by
 * failing or skipping the improvement.
 *
 * It can run again from the top after a crash: each call it makes gives
 * the same answer for the same improvement, and the snapshot is found by
 * its origin key instead of being taken twice.
 */
@Injectable()
export class AnalyzingStep implements ImprovementStep {
  public readonly status = 'analyzing';
  public readonly faultReason = 'verification_error';
  private readonly repositories: RepositoriesPublicApi;
  private readonly coverage: CoveragePublicApi;
  private readonly verification: VerificationPublicApi;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi,
    @Inject(VERIFICATION_PUBLIC_API) verification: VerificationPublicApi,
  ) {
    this.repositories = repositories;
    this.coverage = coverage;
    this.verification = verification;
  }

  public async run(run: ImprovementRun): Promise<StepResult> {
    const progress = new AnalysisProgress(run);
    progress.begin();
    const ending = await this.analysis(run, progress);
    await run.save(ending);
    return { next: 'continue' };
  }

  private async analysis(
    run: ImprovementRun,
    progress: AnalysisProgress,
  ): Promise<Change> {
    const revision = await this.checkRevision(run, progress);
    if (revision !== null) {
      return revision;
    }
    const coverage = await this.measureCoverage(run, progress);
    return coverage ?? (await this.measureBaseline(run, progress));
  }

  private async checkRevision(
    run: ImprovementRun,
    progress: AnalysisProgress,
  ): Promise<Change | null> {
    progress.start('revision_check');
    const { request } = run.improvement;
    const assessment = await this.repositories.assessRevision(
      {
        repositoryId: request.repositoryId,
        snapshotCommit: request.baseCommit,
        targetFile: request.targetFile,
      },
      run.signal,
    );
    const ending = revisionEnding(assessment, request);
    if (ending === null) {
      progress.pass();
    } else {
      progress.fail();
    }
    return ending;
  }

  /** The snapshot is saved at once, so the run goes on from it. */
  private async measureCoverage(
    run: ImprovementRun,
    progress: AnalysisProgress,
  ): Promise<Change | null> {
    progress.start('fresh_snapshot');
    const { id, request } = run.improvement;
    const capture = await this.coverage.captureSnapshot(
      {
        repositoryId: request.repositoryId,
        commit: request.baseCommit,
        originKey: `improvement:${id.value}:baseline`,
      },
      run.signal,
    );
    if (capture.outcome !== 'captured') {
      progress.fail();
      return captureEnding(capture);
    }
    await run.save(recordedSnapshot(capture.snapshot));
    progress.pass();
    const file = await this.coverage.getFileCoverage({
      snapshotId: capture.snapshot.id,
      path: request.targetFile,
    });
    return targetEnding(file, request.targetFile);
  }

  private async measureBaseline(
    run: ImprovementRun,
    progress: AnalysisProgress,
  ): Promise<Change> {
    const result = await this.verification.measureBaseline(
      baselineRequestOf(run, progress),
      run.signal,
    );
    if (result.outcome !== 'measured') {
      progress.fail();
    }
    return measureEnding(result, run.improvement);
  }
}
