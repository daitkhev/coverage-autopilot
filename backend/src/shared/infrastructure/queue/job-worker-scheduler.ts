import { Inject, Injectable } from '@nestjs/common';

import { PROGRESS_INTERVAL_MS } from '#infrastructure/queue/job-lease';
import { JobWorker } from '#infrastructure/queue/job-worker';
import {
  JOB_WORKER_SETTINGS,
  type JobWorkerSettings,
} from '#infrastructure/queue/job-worker-settings';

/**
 * Calls the steps of the worker on the timers of Node. They are the
 * global ones, which are the functions `node:timers` exports: the fake
 * timers of a test replace the globals and not an import of the module.
 */
@Injectable()
export class JobWorkerScheduler {
  private readonly worker: JobWorker;
  private readonly settings: JobWorkerSettings;
  private polling: NodeJS.Timeout | undefined;
  private keeping: NodeJS.Timeout[] = [];

  public constructor(
    @Inject(JobWorker) worker: JobWorker,
    @Inject(JOB_WORKER_SETTINGS) settings: JobWorkerSettings,
  ) {
    this.worker = worker;
    this.settings = settings;
  }

  /** The steps of the worker never reject, so nobody waits for a tick. */
  public start(): void {
    this.polling = setInterval(() => {
      void this.worker.poll();
    }, this.settings.pollMs);
    this.keeping = [
      setInterval(() => {
        void this.worker.heartbeat();
      }, this.settings.heartbeatMs),
      setInterval(() => {
        void this.worker.writeProgress();
      }, PROGRESS_INTERVAL_MS),
    ];
  }

  /**
   * The heartbeat goes on while the worker waits for its handlers, so a
   * handler that takes its time to stop keeps its job.
   */
  public async stop(): Promise<void> {
    clearInterval(this.polling);
    await this.worker.stop();
    for (const timer of this.keeping) {
      clearInterval(timer);
    }
  }
}
