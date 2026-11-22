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
import { JOB_QUEUE, type JobQueue, type JobWait } from '#ports/job-queue.port';

/** A job that waits for its moment waits for no one a person can name. */
function waitOfJob(wait: JobWait | null): WaitingFor | null {
  return wait === 'worker' || wait === 'repository' ? wait : null;
}

/**
 * Turns an improvement into what a person sees of it. The stored state
 * says how far the work has come; the clock adds what it has spent until
 * now, and the queue what its job is doing or waits for.
 */
@Injectable()
export class ImprovementViews {
  private readonly queue: JobQueue;
  private readonly clock: Clock;

  public constructor(
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.queue = queue;
    this.clock = clock;
  }

  public async of(improvement: Improvement): Promise<ImprovementDto> {
    return improvementDtoOf(improvement, await this.liveFactsOf(improvement));
  }

  /**
   * A final improvement has no job that runs or waits: what is left in a
   * finished job is never shown. A wait the improvement knows, for a
   * person or a window, comes before the wait of its job.
   */
  private async liveFactsOf(improvement: Improvement): Promise<LiveFacts> {
    const usage = improvement.usage(this.clock.now());
    if (isFinal(improvement.status)) {
      return { usage, progress: null, waitingFor: null };
    }
    const id = improvement.id.value;
    const job = await this.queue.getProgress(id);
    return {
      usage,
      progress:
        job === null ? null : { steps: job.steps, updatedAt: job.updatedAt },
      waitingFor:
        improvement.waitingFor ?? waitOfJob(await this.queue.getWait(id)),
    };
  }
}
