import type { Writable } from 'node:stream';

import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleInit,
} from '@nestjs/common';

import { CoverageModule } from '#coverage/coverage.module';
import { ImprovementModule } from '#improvement/improvement.module';
import {
  ARTIFACT_DIRECTORY,
  FileArtifactStore,
} from '#infrastructure/artifacts/file-artifact-store.adapter';
import {
  SERVICE_CONFIG,
  type ServiceConfig,
} from '#infrastructure/config/service-config';
import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteJobTable } from '#infrastructure/database/sqlite-job-table';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { API_ERROR_FILTER } from '#infrastructure/http/api-error.filter';
import { ServiceController } from '#infrastructure/http/service.controller';
import {
  SERVICE_LIFE,
  type ServiceLife,
} from '#infrastructure/http/service-life';
import { RandomUuidGenerator } from '#infrastructure/id/random-uuid-generator.adapter';
import { JsonLogger } from '#infrastructure/logging/json-logger.adapter';
import { LOG_SETTINGS } from '#infrastructure/logging/log-settings';
import { JobWorker } from '#infrastructure/queue/job-worker';
import { JobWorkerScheduler } from '#infrastructure/queue/job-worker-scheduler';
import { JOB_WORKER_SETTINGS } from '#infrastructure/queue/job-worker-settings';
import { SqliteJobQueue } from '#infrastructure/queue/sqlite-job-queue.adapter';
import { DockerSandbox } from '#infrastructure/sandbox/docker-sandbox.adapter';
import { SANDBOX_SETTINGS } from '#infrastructure/sandbox/sandbox-settings';
import type { ServiceConnection } from '#infrastructure/service/service-start';
import { SystemClock } from '#infrastructure/time/system-clock.adapter';
import { TimerAlarm } from '#infrastructure/time/timer-alarm.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { CLOCK } from '#kernel/time/clock';
import { ALARM } from '#ports/alarm.port';
import { ARTIFACT_STORE } from '#ports/artifact-store.port';
import { JOB_HANDLERS } from '#ports/job-handler.port';
import { JOB_QUEUE } from '#ports/job-queue.port';
import { LOGGER, type Logger } from '#ports/logger.port';
import { SANDBOX } from '#ports/sandbox.port';
import { TRANSACTION_MANAGER } from '#ports/transaction-manager.port';
import { RepositoriesModule } from '#repositories/repositories.module';
import { jobHandlersOf } from '#service/job-handlers';
import { moduleSettingsOf } from '#service/module-settings';
import { serviceSettingsOf } from '#service/service-settings';
import { VerificationModule } from '#verification/verification.module';

/** What the run of the service has taken before the application exists. */
export interface ServiceWiring {
  readonly config: ServiceConfig;
  /** The one connection of the process, migrated and checked. */
  readonly connection: ServiceConnection;
  /** Where the log lines go, as the entry file names it. */
  readonly logStream: Writable;
  /** The service the routes of the service report on and stop. */
  readonly life: ServiceLife;
}

/** What a module of the service takes from outside, the same for each. */
const SHARED = [
  LOGGER,
  CLOCK,
  ID_GENERATOR,
  ALARM,
  SQLITE_CONNECTION,
  TRANSACTION_MANAGER,
  JOB_QUEUE,
  SANDBOX,
  ARTIFACT_STORE,
];

/**
 * The service: the shared adapters every module takes from outside, the
 * modules, the worker with the handlers of the jobs, the routes of the
 * service itself, and the filter that answers every request that did not
 * succeed. It is global, so a module it imports finds the shared adapters.
 */
@Module({})
export class AppModule implements OnModuleInit {
  private readonly config: ServiceConfig;
  private readonly logger: Logger;

  public constructor(
    @Inject(SERVICE_CONFIG) config: ServiceConfig,
    @Inject(LOGGER) logger: Logger,
  ) {
    this.config = config;
    this.logger = logger;
  }

  /** The service over what its run has taken. */
  public static register(wiring: ServiceWiring): DynamicModule {
    const settings = serviceSettingsOf(wiring.config, wiring.logStream);
    const modules = moduleSettingsOf(wiring.config);
    return {
      module: AppModule,
      global: true,
      imports: [
        RepositoriesModule.register(settings.repositories),
        CoverageModule.register(modules.coverage),
        VerificationModule.register(modules.verification),
        ImprovementModule.register(modules.improvement),
      ],
      controllers: [ServiceController],
      providers: [
        { provide: SERVICE_LIFE, useValue: wiring.life },
        { provide: SERVICE_CONFIG, useValue: wiring.config },
        { provide: LOG_SETTINGS, useValue: settings.log },
        { provide: LOGGER, useClass: JsonLogger },
        { provide: CLOCK, useClass: SystemClock },
        { provide: ID_GENERATOR, useClass: RandomUuidGenerator },
        { provide: ALARM, useClass: TimerAlarm },
        { provide: SQLITE_CONNECTION, useValue: wiring.connection },
        { provide: TRANSACTION_MANAGER, useClass: SqliteTransactionRunner },
        SqliteJobTable,
        { provide: JOB_QUEUE, useClass: SqliteJobQueue },
        { provide: SANDBOX_SETTINGS, useValue: settings.sandbox },
        { provide: SANDBOX, useClass: DockerSandbox },
        { provide: ARTIFACT_DIRECTORY, useValue: settings.artifacts },
        { provide: ARTIFACT_STORE, useClass: FileArtifactStore },
        { provide: JOB_WORKER_SETTINGS, useValue: settings.worker },
        {
          provide: JOB_HANDLERS,
          useFactory: jobHandlersOf,
          inject: [CoverageModule.jobHandler, ImprovementModule.jobHandler],
        },
        JobWorker,
        JobWorkerScheduler,
        API_ERROR_FILTER,
      ],
      exports: SHARED,
    };
  }

  /**
   * A service with no credential of the generator still scans. A person
   * learns at the start which variable it lacks, not at a failed
   * improvement.
   */
  public onModuleInit(): void {
    const { credential, billing } = this.config.generator;
    if (credential.value === null) {
      this.logger.warn(
        'The generator has no credential, so an improvement cannot run. ' +
          'Scans run as usual.',
        { variable: credential.variable, billing },
      );
    }
  }
}
