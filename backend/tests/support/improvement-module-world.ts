import type { DatabaseSync } from 'node:sqlite';

import type { Provider } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
} from '#coverage/contracts/coverage-public-api';
import { RunImprovementHandler } from '#improvement/application/commands/run-improvement/run-improvement.handler';
import {
  IMPROVEMENT_SETTINGS,
  type ImprovementSettings,
} from '#improvement/application/improvement-settings';
import { TEST_GENERATOR } from '#improvement/application/ports/test-generator.port';
import { ImprovementModule } from '#improvement/improvement.module';
import { GENERATOR_SANDBOX } from '#improvement/infrastructure/generator/generator-sandbox';
import {
  GENERATOR_SETTINGS,
  type GeneratorSettings,
} from '#improvement/infrastructure/generator/generator-settings';
import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteJobTable } from '#infrastructure/database/sqlite-job-table';
import { JobWorker } from '#infrastructure/queue/job-worker';
import {
  DEFAULT_JOB_WORKER_SETTINGS,
  JOB_WORKER_SETTINGS,
} from '#infrastructure/queue/job-worker-settings';
import { SqliteJobQueue } from '#infrastructure/queue/sqlite-job-queue.adapter';
import { CLOCK } from '#kernel/time/clock';
import { ALARM } from '#ports/alarm.port';
import { ARTIFACT_STORE } from '#ports/artifact-store.port';
import { JOB_HANDLERS, type JobHandler } from '#ports/job-handler.port';
import { JOB_QUEUE } from '#ports/job-queue.port';
import { LOGGER } from '#ports/logger.port';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/contracts/repositories-public-api';
import { inMemoryArtifacts } from '#tests/support/coverage-stand-ins';
import type { FixedClock } from '#tests/support/fixed-clock';
import { GENERATOR_TEST_SETTINGS } from '#tests/support/generator-request';
import {
  generationCoverage,
  type GenerationRepositories,
  generationRepositories,
  type ScriptedGenerator,
  scriptedGenerator,
} from '#tests/support/improvement-generation-stand-ins';
import { ManualAlarm } from '#tests/support/improvement-handler-alarm';
import { analysisModules } from '#tests/support/improvement-handler-modules';
import { sourceCoverage } from '#tests/support/improvement-request-stand-ins';
import { seedImprovementRows } from '#tests/support/improvement-stores';
import {
  SOURCE_SNAPSHOT_ID,
  TEST_SETTINGS,
} from '#tests/support/improvement-values';
import {
  type StandInGate,
  standInGate,
  type StandInPublisher,
  standInPublisher,
} from '#tests/support/improvement-verdict-stand-ins';
import { RecordingLogger } from '#tests/support/recording-logger';
import { RecordingSandbox } from '#tests/support/recording-sandbox';
import { SchemaRows } from '#tests/support/schema-rows';
import { SharedTestModule } from '#tests/support/shared-test-module';
import {
  VERIFICATION_PUBLIC_API,
  type VerificationPublicApi,
} from '#verification/contracts/verification-public-api';

/** The modules below the improvement, as a test scripts them. */
interface ModulesBelow {
  readonly generator: ScriptedGenerator;
  /** The copies the generator writes into, and the patch taken from one. */
  readonly copies: GenerationRepositories;
  /** The gate, as it judges a patch. It accepts unless a test says. */
  readonly gate: StandInGate;
  /** The head of the default branch and the answer of a publication. */
  readonly publisher: StandInPublisher;
}

/** What a test of the whole module changes. The rest is as the tests. */
export interface WorldSpec {
  readonly settings?: ImprovementSettings;
  readonly generatorSettings?: GeneratorSettings;
  /** The adapter of the module instead of the scripted generator. */
  readonly realGenerator?: boolean;
}

/** The module on a real database and a real queue, with one worker. */
export interface ImprovementWorld extends ModulesBelow {
  readonly module: TestingModule;
  readonly clock: FixedClock;
  readonly connection: DatabaseSync;
  /** Runs every job that may start now, each to its end. */
  readonly work: () => Promise<void>;
}

/**
 * The three contracts, each put together from the stand-ins of the steps
 * that call it: the source snapshot answers a request, the fresh one the
 * analysis and the generation.
 */
function contractsOf(below: ModulesBelow): Provider[] {
  const analysis = analysisModules();
  const source = sourceCoverage();
  const fresh = generationCoverage();
  const coverage: CoveragePublicApi = {
    ...analysis.coverage,
    getSnapshot: async (request) =>
      request.snapshotId === SOURCE_SNAPSHOT_ID
        ? source.getSnapshot(request)
        : fresh.getSnapshot(request),
  };
  const repositories: RepositoriesPublicApi = {
    ...below.copies,
    assessRevision: async (request, signal) =>
      below.publisher.assessRevision(request, signal),
    publishPatch: async (request, signal) =>
      below.publisher.publishPatch(request, signal),
  };
  const verification: VerificationPublicApi = {
    measureBaseline: async (request, signal) =>
      analysis.verification.measureBaseline(request, signal),
    verifyPatch: async (request, signal) =>
      below.gate.verifyPatch(request, signal),
  };
  return [
    { provide: COVERAGE_PUBLIC_API, useValue: coverage },
    { provide: REPOSITORIES_PUBLIC_API, useValue: repositories },
    { provide: VERIFICATION_PUBLIC_API, useValue: verification },
  ];
}

/** What the service gives the module, with a worker that runs its jobs. */
function serviceOf(spec: WorldSpec): Provider[] {
  return [
    {
      provide: IMPROVEMENT_SETTINGS,
      useValue: spec.settings ?? TEST_SETTINGS,
    },
    {
      provide: GENERATOR_SETTINGS,
      useValue: spec.generatorSettings ?? GENERATOR_TEST_SETTINGS,
    },
    { provide: GENERATOR_SANDBOX, useValue: new RecordingSandbox() },
    { provide: ARTIFACT_STORE, useValue: inMemoryArtifacts() },
    { provide: ALARM, useValue: new ManualAlarm() },
    { provide: LOGGER, useValue: new RecordingLogger() },
    SqliteJobTable,
    { provide: JOB_QUEUE, useClass: SqliteJobQueue },
    { provide: JOB_WORKER_SETTINGS, useValue: DEFAULT_JOB_WORKER_SETTINGS },
    {
      provide: JOB_HANDLERS,
      useFactory: (handler: JobHandler): JobHandler[] => [handler],
      inject: [RunImprovementHandler],
    },
    JobWorker,
  ];
}

/**
 * Compiles the module of the improvement as the service would, over a
 * migrated database with the rows an improvement of the tests refers to.
 */
export async function improvementWorld(
  spec: WorldSpec = {},
): Promise<ImprovementWorld> {
  const below: ModulesBelow = {
    generator: scriptedGenerator(),
    copies: generationRepositories(),
    gate: standInGate(),
    publisher: standInPublisher(),
  };
  const providers = [...contractsOf(below), ...serviceOf(spec)];
  const building = Test.createTestingModule({
    imports: [
      SharedTestModule.create(),
      { module: ImprovementModule, providers },
    ],
  });
  if (spec.realGenerator !== true) {
    building.overrideProvider(TEST_GENERATOR).useValue(below.generator);
  }
  const module = await (await building.compile()).init();
  const connection = module.get<DatabaseSync>(SQLITE_CONNECTION);
  seedImprovementRows(new SchemaRows(connection));
  const worker = module.get(JobWorker);
  return {
    ...below,
    module,
    connection,
    clock: module.get<FixedClock>(CLOCK),
    work: async () => {
      await worker.poll();
      await worker.whenIdle();
    },
  };
}
