import type { INestApplication } from '@nestjs/common';

import type { InstanceLock } from '#infrastructure/database/instance-lock';
import { JobWorkerScheduler } from '#infrastructure/queue/job-worker-scheduler';
import type { ServiceConnection } from '#infrastructure/service/service-start';
import type { Instant } from '#kernel/time/instant';

/** What a start took before the application existed. */
export interface HeldParts {
  readonly lock: InstanceLock;
  readonly connection: ServiceConnection;
  /** The path of the socket, which only the holder of the lock may touch. */
  readonly socket: string;
}

/**
 * Gives back what a start took: the connection, and the lock last, which
 * is released even when closing the connection failed. Until then no
 * other service of the instance can start, so none finds a part of this
 * one still in use. The socket file needs no step: a server that closes
 * removes it, and a start removes one a crash left.
 */
export function giveBack(held: HeldParts): void {
  try {
    held.connection.close();
  } finally {
    held.lock.release();
  }
}

/** A service that listens and works until it is stopped. */
export class RunningService {
  /** When it began to answer, which `GET /health` reports. */
  public readonly startedAt: Instant;
  /**
   * Settles once the service has stopped, whoever asked for it: a signal
   * to the process, or a route.
   */
  public readonly stopped: Promise<void>;
  private readonly application: INestApplication;
  private readonly held: HeldParts;
  private readonly asked = Promise.withResolvers<undefined>();

  public constructor(
    application: INestApplication,
    held: HeldParts,
    startedAt: Instant,
  ) {
    this.application = application;
    this.held = held;
    this.startedAt = startedAt;
    this.stopped = this.stopWhenAsked();
  }

  /**
   * Ends in the reverse order of the start, and gives `stopped`. A second
   * call joins the first. A route that asks for it answers first and does
   * not wait for it, as the server waits for that answer to close.
   */
  public stop(): Promise<void> {
    this.asked.resolve(undefined);
    return this.stopped;
  }

  /**
   * No job is claimed any more, and every running one is told the worker
   * stops and goes back to the queue. Then the HTTP server closes once
   * its open requests are answered, and the rest is given back.
   */
  private async stopWhenAsked(): Promise<void> {
    await this.asked.promise;
    try {
      await this.application.get(JobWorkerScheduler).stop();
      await this.application.close();
    } finally {
      giveBack(this.held);
    }
  }
}
