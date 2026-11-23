import { Inject, Injectable } from '@nestjs/common';

import type {
  ScanDto,
  ScanProgressDto,
} from '#coverage/application/dto/scan.dto';
import { scanDtoOf } from '#coverage/application/dto/scan-dto-mapping';
import { MissingScanError } from '#coverage/application/errors/missing-scan.error';
import { JOB_QUEUE, type JobDto, type JobQueue } from '#ports/job-queue.port';

/**
 * Turns the job of a scan into what a person sees of it. The job tells
 * how the scan stands, and the queue adds its steps while a worker runs
 * it.
 */
@Injectable()
export class ScanViews {
  private readonly queue: JobQueue;

  public constructor(@Inject(JOB_QUEUE) queue: JobQueue) {
    this.queue = queue;
  }

  /** The scan with the id, or `null` when there is none. */
  public async find(scanId: string): Promise<ScanDto | null> {
    const job = await this.findJob(scanId);
    if (job === null) {
      return null;
    }
    const progress =
      job.status === 'leased' ? await this.progressOf(job) : null;
    return scanDtoOf(job, progress);
  }

  /** The scan of a job the caller knows to be a scan, such as one it queued. */
  public async get(scanId: string): Promise<ScanDto> {
    const scan = await this.find(scanId);
    if (scan === null) {
      throw new MissingScanError(`No scan job has the id ${scanId}.`);
    }
    return scan;
  }

  /** `null` when no job has the id, or the job is not a scan. */
  public async findJob(scanId: string): Promise<JobDto | null> {
    const job = await this.queue.getJob(scanId);
    return job?.kind === 'scan' ? job : null;
  }

  /**
   * The queue keeps progress for the leased job of a subject, and the
   * subject of a scan is its repository: the steps may belong to another
   * scan of it that started since the job was read.
   */
  private async progressOf(job: JobDto): Promise<ScanProgressDto | null> {
    const progress = await this.queue.getProgress(job.subjectId);
    return progress?.jobId === job.id
      ? { steps: progress.steps, updatedAt: progress.updatedAt }
      : null;
  }
}
