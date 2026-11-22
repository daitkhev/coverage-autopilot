import type { Writable } from 'node:stream';

import type { INestApplication } from '@nestjs/common';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface.js';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';

import type { ServiceConfig } from '#infrastructure/config/service-config';
import { JobWorkerScheduler } from '#infrastructure/queue/job-worker-scheduler';
import { restrictSocket } from '#infrastructure/service/service-socket';
import { startService } from '#infrastructure/service/service-start';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { AppModule, type ServiceWiring } from '#service/app.module';
import {
  giveBack,
  type HeldParts,
  RunningService,
} from '#service/running-service';

/** What the entry file gives a run besides the configuration. */
export interface ServiceStartup {
  /** Found from the place of the entry file, which a bundle moves. */
  readonly migrationsFolder: string;
  /** Where the log lines go: the standard error of the process. */
  readonly logStream: Writable;
}

/** A service that runs, or, as a value, that another one holds the lock. */
export type ServiceRun =
  | { readonly outcome: 'running'; readonly service: RunningService }
  | { readonly outcome: 'held_by_another' };

/**
 * The framework writes nothing of its own, since the service has its log,
 * and a fault of the start is thrown to the caller, which gives back what
 * it took, rather than ending the process there.
 */
const APPLICATION_OPTIONS = Object.assign(new NestApplicationContextOptions(), {
  logger: false,
  abortOnError: false,
});

/** Listens under the held lock, keeps the socket to its owner, then works. */
async function serving(
  wiring: ServiceWiring,
  held: HeldParts,
): Promise<INestApplication> {
  const application = await NestFactory.create(
    AppModule.register(wiring),
    new ExpressAdapter(),
    APPLICATION_OPTIONS,
  );
  try {
    await application.listen(held.socket);
    restrictSocket(held.lock, held.socket);
  } catch (error) {
    await application.close();
    throw error;
  }
  application.get(JobWorkerScheduler).start();
  return application;
}

/**
 * Starts the service of an instance in its fixed order: the lock, the
 * database, the removal of a socket a crashed service left, the
 * application on the socket, kept to its owner, and then the worker,
 * which takes back first the jobs whose lease ran out. A start that fails
 * gives back what it took and throws, so the next one begins from the
 * same place.
 */
export async function runService(
  config: ServiceConfig,
  startup: ServiceStartup,
): Promise<ServiceRun> {
  const start = startService(config, startup.migrationsFolder);
  if (start.outcome === 'held_by_another') {
    return start;
  }
  const { lock, connection } = start;
  const held = { lock, connection, socket: config.instance.socket };
  try {
    const application = await serving(
      { config, connection, logStream: startup.logStream },
      held,
    );
    const startedAt = application.get<Clock>(CLOCK).now();
    const service = new RunningService(application, held, startedAt);
    return { outcome: 'running', service };
  } catch (error) {
    giveBack(held);
    throw error;
  }
}
