import type { Writable } from 'node:stream';

import type { INestApplication } from '@nestjs/common';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface.js';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';

import { AppModule, type ServiceWiring } from '#composition/app.module';
import { prepareImages } from '#composition/image-start';
import { sweepLeftovers } from '#composition/leftover-sweep';
import type { ServiceConfig } from '#infrastructure/config/service-config';
import {
  type ShippedImageFiles,
  withShippedBuilds,
} from '#infrastructure/config/shipped-images';
import { closingOnStop } from '#infrastructure/http/closing-on-stop';
import { JobWorkerScheduler } from '#infrastructure/queue/job-worker-scheduler';
import {
  giveBack,
  type HeldParts,
  RunningService,
} from '#infrastructure/service/running-service';
import { restrictSocket } from '#infrastructure/service/service-socket';
import {
  type HeldOutcome,
  startService,
} from '#infrastructure/service/service-start';
import { SystemClock } from '#infrastructure/time/system-clock.adapter';
import type { Pause } from '#infrastructure/time/timer-pause';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { LOGGER, type Logger } from '#ports/logger.port';

/** What the entry file gives a run besides the configuration. */
export interface ServiceStartup {
  /** Found from the place of the entry file, which a bundle moves. */
  readonly migrationsFolder: string;
  /** Where the log lines go: the standard error of the process. */
  readonly logStream: Writable;
  /** The version of the package, which the entry file reads beside it. */
  readonly version: string;
  /** Between two looks at a lock that another service holds. */
  readonly pause: Pause;
  /**
   * What the images the service makes are built from, found from the place
   * of the entry file as the migrations are.
   */
  readonly imageFiles: ShippedImageFiles;
}

/** A service that runs, or, as a value, why another one keeps the lock. */
export type ServiceRun =
  | { readonly outcome: 'running'; readonly service: RunningService }
  | { readonly outcome: HeldOutcome };

/**
 * The framework writes nothing of its own, since the service has its log,
 * and a fault of the start is thrown to the caller, which gives back what
 * it took, rather than ending the process there.
 */
const APPLICATION_OPTIONS = Object.assign(new NestApplicationContextOptions(), {
  logger: false,
  abortOnError: false,
});

/**
 * Removes what a stopped service of the instance left, then listens under
 * the held lock, with connections that close once it stops, keeps the
 * socket to its owner, starts to make the images ready without waiting
 * for them, and works.
 */
async function serving(
  wiring: ServiceWiring,
  held: HeldParts,
): Promise<INestApplication> {
  const application = await NestFactory.create(
    AppModule.register(wiring),
    new ExpressAdapter(),
    APPLICATION_OPTIONS,
  );
  application.use(closingOnStop(wiring.life));
  try {
    await sweepLeftovers(
      wiring.config,
      application.get<Logger>(LOGGER),
      application.get<Clock>(CLOCK),
    );
    await application.listen(held.socket);
    restrictSocket(held.lock, held.socket);
  } catch (error) {
    await application.close();
    throw error;
  }
  prepareImages(application, wiring);
  application.get(JobWorkerScheduler).start();
  return application;
}

/**
 * Starts the service of an instance in its fixed order: the lock, waited
 * for while a service on its way out still holds it, the database, the
 * removal of a socket a crashed service left, the removal of the
 * containers and the working copies it left, the application on the
 * socket, kept to its owner, the preparation of the images in the
 * background, and then the worker, which takes back first the jobs whose
 * lease ran out. A start that fails gives back what it took and throws,
 * so the next one begins from the same place.
 */
export async function runService(
  config: ServiceConfig,
  startup: ServiceStartup,
): Promise<ServiceRun> {
  const start = await startService(
    config,
    startup.migrationsFolder,
    startup.pause,
  );
  if (start.outcome !== 'started') {
    return start;
  }
  const { lock, connection } = start;
  const held = { lock, connection, socket: config.instance.socket };
  const service = new RunningService(held, {
    version: startup.version,
    startedAt: new SystemClock().now(),
  });
  try {
    const { logStream } = startup;
    const wiring = {
      config: withShippedBuilds(config, startup.imageFiles),
      connection,
      logStream,
      life: service,
    };
    service.serve(await serving(wiring, held));
    return { outcome: 'running', service };
  } catch (error) {
    giveBack(held);
    throw error;
  }
}
