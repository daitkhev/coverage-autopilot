import type { ServerResponse } from 'node:http';

import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
} from '@nestjs/common';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import {
  CONTRACT_VERSION,
  type Health,
  type StopServiceResult,
} from '@coverage-autopilot/api-contracts/health';

import {
  SERVICE_CONFIG,
  type ServiceConfig,
} from '#infrastructure/config/service-config';
import {
  SERVICE_LIFE,
  type ServiceLife,
} from '#infrastructure/http/service-life';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';

/**
 * The routes of the service itself: its state, and a stop when it is
 * idle. What only a module knows, the account of the code host, the
 * windows of a subscription and the versions of the tools, is not known
 * here yet, so it is the empty answer the contract allows.
 */
@Controller()
export class ServiceController {
  private readonly life: ServiceLife;
  private readonly config: ServiceConfig;
  private readonly queue: JobQueue;

  public constructor(
    @Inject(SERVICE_LIFE) life: ServiceLife,
    @Inject(SERVICE_CONFIG) config: ServiceConfig,
    @Inject(JOB_QUEUE) queue: JobQueue,
  ) {
    this.life = life;
    this.config = config;
    this.queue = queue;
  }

  @Get('health')
  public async health(): Promise<Health> {
    const running = await this.queue.countRunning();
    const { cli, billing } = this.config.generator;
    const alive = !this.life.stopping;
    return {
      ready: alive,
      contractVersion: CONTRACT_VERSION,
      serviceVersion: this.life.version,
      startedAt: this.life.startedAt.toString(),
      githubAccount: null,
      generator: { cli, billing, limits: null },
      worker: { alive, lastSeenAt: null },
      activeWork: {
        scans: running.scan,
        improvements: running.improvement,
      },
      tools: [],
    };
  }

  /**
   * A client of a newer contract replaces an idle service. A running job
   * would go back to the queue half done, so a busy service refuses and
   * changes nothing. The stop begins once the answer is written.
   */
  @Post('service/stop')
  @HttpCode(HttpStatus.ACCEPTED)
  public async stop(
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<StopServiceResult> {
    const running = await this.queue.countRunning();
    const jobs = running.scan + running.improvement;
    if (jobs > 0) {
      throw new ConflictException({
        error: 'status_conflict',
        message:
          `${String(jobs)} jobs are running. Ask again once they ended, ` +
          'or cancel them.',
      } satisfies ErrorBody);
    }
    response.once('finish', () => {
      void this.life.stop();
    });
    return { stopping: true };
  }
}
