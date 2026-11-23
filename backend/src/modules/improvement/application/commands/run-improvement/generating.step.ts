import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
} from '#coverage/application/contracts/coverage-public-api';
import {
  type CopyContent,
  type FinishedCall,
  recordOf,
} from '#improvement/application/commands/run-improvement/generation-record';
import {
  generationRequestOf,
  type GenerationSubject,
} from '#improvement/application/commands/run-improvement/generation-request';
import {
  failWithoutSnapshot,
  openAttemptWithinBudget,
} from '#improvement/application/commands/run-improvement/generation-start';
import { resumeJobOf } from '#improvement/application/commands/run-improvement/improvement-jobs';
import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type {
  ImprovementStep,
  StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import {
  IMPROVEMENT_SETTINGS,
  type ImprovementSettings,
} from '#improvement/application/improvement-settings';
import {
  type GenerationResult,
  TEST_GENERATOR,
  type TestGenerator,
} from '#improvement/application/ports/test-generator.port';
import type { Attempt } from '#improvement/domain/entities/attempt.entity';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { FailureReason } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';
import type { Transaction } from '#kernel/transaction/transaction';
import {
  JOB_QUEUE,
  type JobProgress,
  type JobQueue,
} from '#ports/job-queue.port';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/application/contracts/repositories-public-api';

const CONTINUE: StepResult = { next: 'continue' };

/**
 * The code the repositories module throws, as its contract says, for a
 * copy whose tree holds a `.git` of its own.
 */
const TAMPERED_COPY = 'working_copy_tampered';

const UNCHANGED: CopyContent = { state: 'unchanged' };

const TAMPERED: CopyContent = { state: 'tampered' };

/** A fault is known by its code: the contract names no class of it. */
function isTampering(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && error.code === TAMPERED_COPY
  );
}

/**
 * The generator reports no steps: the screen shows the attempt and the
 * time since it began. An empty list clears what a gate run before left.
 */
const NO_STEPS: JobProgress = { steps: [] };

/**
 * The work of `generating`: one call of the generator for the open
 * attempt, in a working copy of its own, recorded in one save. Every end
 * is a save, so the handler looks at the status again.
 */
@Injectable()
export class GeneratingStep implements ImprovementStep {
  public readonly status: ImprovementStatus = 'generating';
  public readonly faultReason: FailureReason = 'generator_unavailable';
  private readonly repositories: RepositoriesPublicApi;
  private readonly coverage: CoveragePublicApi;
  private readonly generator: TestGenerator;
  private readonly queue: JobQueue;
  private readonly settings: ImprovementSettings;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi,
    @Inject(TEST_GENERATOR) generator: TestGenerator,
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(IMPROVEMENT_SETTINGS) settings: ImprovementSettings,
  ) {
    this.repositories = repositories;
    this.coverage = coverage;
    this.generator = generator;
    this.queue = queue;
    this.settings = settings;
  }

  public async run(run: ImprovementRun): Promise<StepResult> {
    const subject = await this.subjectOf(run.improvement);
    if (subject === null) {
      await run.save(failWithoutSnapshot);
      return CONTINUE;
    }
    const attempt = await this.attemptOf(run);
    if (attempt === null) {
      return CONTINUE;
    }
    run.reportProgress(NO_STEPS);
    const finished = await this.call(run, subject, attempt);
    await this.record(run, finished);
    return CONTINUE;
  }

  /**
   * The test runner and the target, as the fresh snapshot measured them,
   * or `null` when the snapshot is gone. The domain lets an improvement
   * generate only once the snapshot is recorded.
   */
  private async subjectOf(
    improvement: Improvement,
  ): Promise<GenerationSubject | null> {
    const snapshotId = improvement.baselineSnapshotId?.value;
    if (snapshotId === undefined) {
      return null;
    }
    const snapshot = await this.coverage.getSnapshot({ snapshotId });
    if (snapshot === null) {
      return null;
    }
    const path = improvement.request.targetFile;
    return {
      testRunner: snapshot.project.testRunner,
      file: await this.coverage.getFileCoverage({ snapshotId, path }),
    };
  }

  /**
   * The open attempt, which a run after a crash or after a wait finds,
   * or a new one. `null` when the budget allowed none and the improvement
   * failed.
   */
  private async attemptOf(run: ImprovementRun): Promise<Attempt | null> {
    if (run.improvement.currentAttempt === null) {
      await run.save(openAttemptWithinBudget);
    }
    return run.improvement.currentAttempt;
  }

  /**
   * The generator has no shell, so nothing is installed in its copy. The
   * patch is taken once the call returned, when its sandbox has ended,
   * and the copy is thrown away after every outcome and every fault: a
   * call that stopped at a limit may have written a file.
   */
  private async call(
    run: ImprovementRun,
    subject: GenerationSubject,
    attempt: Attempt,
  ): Promise<FinishedCall> {
    const { improvement } = run;
    const owner = `${run.owner}:attempt:${String(attempt.number)}`;
    const copy = await this.repositories.createWorkingCopy(
      {
        repositoryId: improvement.request.repositoryId,
        commit: improvement.request.baseCommit,
        purpose: owner,
      },
      run.signal,
    );
    try {
      const request = generationRequestOf({
        improvement,
        subject,
        owner,
        workingCopyPath: copy.path,
        settings: this.settings,
        now: run.now(),
      });
      const result = await this.generator.generate(request, run.signal);
      return { result, copy: await this.contentOf(result, copy.id) };
    } finally {
      await this.repositories.disposeWorkingCopy({ workingCopyId: copy.id });
    }
  }

  /**
   * A copy that holds a `.git` of its own is the one fault of taking a
   * patch that is answered here: the call before it was paid for, and a
   * fault would lose what it spent.
   */
  private async contentOf(
    result: GenerationResult,
    workingCopyId: string,
  ): Promise<CopyContent> {
    if (result.outcome !== 'generated') {
      return UNCHANGED;
    }
    try {
      const extraction = await this.repositories.extractPatch({
        workingCopyId,
      });
      return extraction.outcome === 'extracted'
        ? { state: 'patch', patch: extraction.patch }
        : UNCHANGED;
    } catch (error) {
      if (isTampering(error)) {
        return TAMPERED;
      }
      throw error;
    }
  }

  /**
   * One save of the call. A wait is stored with the job that ends it, so
   * neither is kept alone. A third spent window fails the improvement in
   * the domain instead, and then no job is added.
   */
  private async record(
    run: ImprovementRun,
    finished: FinishedCall,
  ): Promise<void> {
    await run.save(
      recordOf(finished, run.now(), this.settings.limitWaitMs),
      async (transaction, saved) => this.resumeLater(saved, transaction),
    );
  }

  private async resumeLater(
    saved: Improvement,
    transaction: Transaction,
  ): Promise<void> {
    if (saved.resumesAt !== null) {
      await this.queue.enqueue(
        resumeJobOf(saved, saved.resumesAt),
        transaction,
      );
    }
  }
}
