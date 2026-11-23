import { Inject, Injectable } from '@nestjs/common';

import type {
  ImprovementDto,
  WaitingFor,
} from '#improvement/application/dto/improvement.dto';
import {
  improvementDtoOf,
  type LiveFacts,
} from '#improvement/application/dto/improvement-dto-mapping';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { isFinal } from '#improvement/domain/value-objects/improvement-status.vo';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { ARTIFACT_STORE, type ArtifactStore } from '#ports/artifact-store.port';
import { JOB_QUEUE, type JobQueue, type JobWait } from '#ports/job-queue.port';

/**
 * A job that waits for its moment waits for the window the improvement
 * names itself, so only a worker and the repository are taken from it.
 */
function waitOfJob(wait: JobWait | null): WaitingFor | null {
  return wait === 'worker' || wait === 'repository' ? wait : null;
}

/**
 * Turns an improvement into what a person sees of it. The stored state
 * says how far the work has come; the clock adds what it has spent until
 * now, the queue what its job is doing or waits for, and the store of
 * tool output where the files of its raw output are.
 */
@Injectable()
export class ImprovementViews {
  private readonly queue: JobQueue;
  private readonly clock: Clock;
  private readonly artifacts: ArtifactStore;

  public constructor(
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(CLOCK) clock: Clock,
    @Inject(ARTIFACT_STORE) artifacts: ArtifactStore,
  ) {
    this.queue = queue;
    this.clock = clock;
    this.artifacts = artifacts;
  }

  public async of(improvement: Improvement): Promise<ImprovementDto> {
    return improvementDtoOf(
      improvement,
      await this.liveFactsOf(improvement),
      (reference) => this.artifacts.pathOf(reference),
    );
  }

  /**
   * A final improvement has no job that runs or waits: what is left in a
   * finished job is never shown.
   */
  private async liveFactsOf(improvement: Improvement): Promise<LiveFacts> {
    const usage = improvement.usage(this.clock.now());
    if (isFinal(improvement.status)) {
      return { usage, progress: null, waitingFor: null };
    }
    const job = await this.queue.getProgress(improvement.id.value);
    return {
      usage,
      progress:
        job === null ? null : { steps: job.steps, updatedAt: job.updatedAt },
      waitingFor: await this.waitingForOf(improvement),
    };
  }

  /**
   * Nothing goes on before a person approves, and no job waits meanwhile.
   * Else a job that waits for a worker or for its repository says what
   * holds the improvement now: a window that opened still waits so until
   * its job is taken. While the job waits for its moment, the improvement
   * names the window itself.
   */
  private async waitingForOf(
    improvement: Improvement,
  ): Promise<WaitingFor | null> {
    const own = improvement.waitingFor;
    if (own === 'approval') {
      return own;
    }
    return waitOfJob(await this.queue.getWait(improvement.id.value)) ?? own;
  }
}
