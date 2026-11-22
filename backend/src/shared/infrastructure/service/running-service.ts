import type { INestApplication } from '@nestjs/common';

import type { InstanceLock } from '#infrastructure/database/instance-lock';
import type { ServiceLife } from '#infrastructure/http/service-life';
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

/** What a run knows of its service before the application exists. */
export interface ServiceStamp {
  readonly version: string;
  readonly startedAt: Instant;
}

/**
 * A service that listens and works until it is stopped. It is made before
 * the application, so the routes of the application can reach it, and is
 * handed the application once that listens and works.
 */
export class RunningService implements ServiceLife {
  public readonly version: string;
  /** After the lock and the migrations, as `GET /health` reports it. */
  public readonly startedAt: Instant;
  /**
   * Settles once the service has stopped, whoever asked for it: a signal
   * to the process, or a route.
   */
  public readonly stopped: Promise<void>;
  private readonly held: HeldParts;
  private readonly asked = Promise.withResolvers<undefined>();
  private readonly application = Promise.withResolvers<INestApplication>();
  private asking = false;

  public constructor(held: HeldParts, stamp: ServiceStamp) {
    this.held = held;
    this.version = stamp.version;
    this.startedAt = stamp.startedAt;
    this.stopped = this.stopWhenAsked();
  }

  public get stopping(): boolean {
    return this.asking;
  }

  /** The application, once it listens and its worker works. */
  public serve(application: INestApplication): void {
    this.application.resolve(application);
  }

  /**
   * Ends in the reverse order of the start, and gives `stopped`. A second
   * call joins the first. A stop asked before the application was handed
   * over waits for it.
   */
  public stop(): Promise<void> {
    this.asking = true;
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
    const application = await this.application.promise;
    try {
      await application.get(JobWorkerScheduler).stop();
      await application.close();
    } finally {
      giveBack(this.held);
    }
  }
}
