import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleInit,
  type Type,
} from '@nestjs/common';

import { ApproveImprovementHandler } from '#improvement/application/commands/approve-improvement/approve-improvement.handler';
import { CancelImprovementHandler } from '#improvement/application/commands/cancel-improvement/cancel-improvement.handler';
import { AnalyzingStep } from '#improvement/application/commands/run-improvement/analyzing.step';
import { GeneratingStep } from '#improvement/application/commands/run-improvement/generating.step';
import {
  IMPROVEMENT_STEPS,
  type ImprovementStep,
} from '#improvement/application/commands/run-improvement/improvement-step';
import { PublishingStep } from '#improvement/application/commands/run-improvement/publishing.step';
import { RunImprovementHandler } from '#improvement/application/commands/run-improvement/run-improvement.handler';
import { VerifyingStep } from '#improvement/application/commands/run-improvement/verifying.step';
import { ImprovementRegistration } from '#improvement/application/commands/start-improvement/improvement-registration';
import { StartImprovementHandler } from '#improvement/application/commands/start-improvement/start-improvement.handler';
import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import {
  type GenerationCallLimits,
  IMPROVEMENT_SETTINGS,
  type ImprovementSettings,
} from '#improvement/application/improvement-settings';
import { REQUEST_HASHER } from '#improvement/application/ports/request-hasher.port';
import { TEST_GENERATOR } from '#improvement/application/ports/test-generator.port';
import { GetBudgetSettingsHandler } from '#improvement/application/queries/get-budget-settings/get-budget-settings.handler';
import { GetImprovementHandler } from '#improvement/application/queries/get-improvement/get-improvement.handler';
import { GetImprovementPatchHandler } from '#improvement/application/queries/get-improvement-patch/get-improvement-patch.handler';
import { ListImprovementsHandler } from '#improvement/application/queries/list-improvements/list-improvements.handler';
import { ListSnapshotFilesHandler } from '#improvement/application/queries/list-snapshot-files/list-snapshot-files.handler';
import { IMPROVEMENT_REPOSITORY } from '#improvement/domain/repositories/improvement.repository';
import {
  Budget,
  type BudgetLimits,
} from '#improvement/domain/value-objects/budget.vo';
import { BudgetSettings } from '#improvement/domain/value-objects/budget-settings.vo';
import {
  GeneratorConfig,
  type GeneratorConfigProps,
} from '#improvement/domain/value-objects/generator-config.vo';
import type { ImprovementMode } from '#improvement/domain/value-objects/improvement-mode.vo';
import {
  QualityPolicy,
  type QualityPolicyProps,
} from '#improvement/domain/value-objects/quality-policy.vo';
import { ClaudeCodeGenerator } from '#improvement/infrastructure/generator/claude-code-generator.adapter';
import { GENERATOR_SANDBOX } from '#improvement/infrastructure/generator/generator-sandbox';
import {
  GENERATOR_SETTINGS,
  type GeneratorSettings,
} from '#improvement/infrastructure/generator/generator-settings';
import { Sha256RequestHasher } from '#improvement/infrastructure/hashing/sha256-request-hasher.adapter';
import { AnswerStatus } from '#improvement/infrastructure/http/answer-status';
import { BudgetSettingsController } from '#improvement/infrastructure/http/budget-settings.controller';
import { ImprovementDecisionsController } from '#improvement/infrastructure/http/improvement-decisions.controller';
import { ImprovementRequestsController } from '#improvement/infrastructure/http/improvement-requests.controller';
import { ImprovementsController } from '#improvement/infrastructure/http/improvements.controller';
import { SnapshotFilesController } from '#improvement/infrastructure/http/snapshot-files.controller';
import { checkImprovementSettings } from '#improvement/infrastructure/improvement-settings.schema';
import { SqliteImprovementRepository } from '#improvement/infrastructure/persistence/sqlite-improvement.repository';
import { DockerSandbox } from '#infrastructure/sandbox/docker-sandbox.adapter';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { JobHandler } from '#ports/job-handler.port';
import type { Sandbox } from '#ports/sandbox.port';

/** One step for each status that has work, in the order of the path. */
const STEPS = [AnalyzingStep, GeneratingStep, VerifyingStep, PublishingStep];

/** The settings of the module and of its generator, as plain values. */
interface ImprovementValues {
  readonly budget: {
    readonly defaults: BudgetLimits;
    readonly maximums: BudgetLimits;
  };
  readonly mode: ImprovementMode;
  readonly policy: QualityPolicyProps;
  readonly generator: GeneratorConfigProps;
  readonly generation: GenerationCallLimits;
  readonly testFileSuffixes: readonly string[];
  readonly limitWaitMs: number;
  /** How the adapter starts the CLI. Its credential may be missing. */
  readonly adapter: GeneratorSettings;
  /** The second sandbox, the one the CLI runs in. */
  readonly sandbox: SandboxSettings;
}

/** The values the domain checks, made once at the start. */
function settingsOf(values: ImprovementValues): ImprovementSettings {
  const { credential } = values.adapter;
  return {
    budget: BudgetSettings.create({
      defaults: Budget.create(values.budget.defaults),
      maximums: Budget.create(values.budget.maximums),
    }),
    mode: values.mode,
    policy: QualityPolicy.create(values.policy),
    generator: GeneratorConfig.create(values.generator),
    generation: values.generation,
    testFileSuffixes: values.testFileSuffixes,
    limitWaitMs: values.limitWaitMs,
    missingCredential: credential.value === null ? credential.variable : null,
  };
}

/**
 * An improvement of one file: the request for it, the job that runs it
 * from status to status, the generator that writes the test, and what a
 * person sees and decides on the way. Its routes are those of
 * improvements, of the files of a snapshot with the work on each, and of
 * the settings of a budget.
 *
 * It takes from the modules around it: the contracts of `repositories`,
 * `coverage` and `verification`, the queue, the transaction manager, the
 * SQLite connection, the clock, the alarm, the id generator, the store of
 * tool output, the sandbox of the generator, and the settings of this
 * module and of the generator. `register` binds the last three. The
 * service lists `RunImprovementHandler` among the handlers of its worker.
 */
@Module({
  controllers: [
    ImprovementRequestsController,
    ImprovementsController,
    ImprovementDecisionsController,
    SnapshotFilesController,
    BudgetSettingsController,
  ],
  providers: [
    { provide: IMPROVEMENT_REPOSITORY, useClass: SqliteImprovementRepository },
    { provide: TEST_GENERATOR, useClass: ClaudeCodeGenerator },
    { provide: REQUEST_HASHER, useClass: Sha256RequestHasher },
    ...STEPS,
    {
      provide: IMPROVEMENT_STEPS,
      useFactory: (...steps: ImprovementStep[]): ImprovementStep[] => steps,
      inject: STEPS,
    },
    RunImprovementHandler,
    ImprovementViews,
    ImprovementRegistration,
    StartImprovementHandler,
    ApproveImprovementHandler,
    CancelImprovementHandler,
    GetImprovementHandler,
    ListImprovementsHandler,
    GetImprovementPatchHandler,
    GetBudgetSettingsHandler,
    ListSnapshotFilesHandler,
    AnswerStatus,
  ],
  exports: [RunImprovementHandler],
})
export class ImprovementModule implements OnModuleInit {
  /**
   * The handler of improvements, which the module exports. The root gives
   * it to the worker by this class, without reaching into a layer.
   */
  public static readonly jobHandler: Type<JobHandler> = RunImprovementHandler;

  private readonly settings: ImprovementSettings;
  private readonly generator: GeneratorSettings;

  public constructor(
    @Inject(IMPROVEMENT_SETTINGS) settings: ImprovementSettings,
    @Inject(GENERATOR_SETTINGS) generator: GeneratorSettings,
  ) {
    this.settings = settings;
    this.generator = generator;
  }

  /**
   * The module with its settings, and the sandbox the CLI runs in: a
   * second `DockerSandbox`, with the image of the CLI and a larger limit
   * of output, on the clock and the ids the service shares.
   */
  public static register(values: ImprovementValues): DynamicModule {
    return {
      module: ImprovementModule,
      providers: [
        { provide: IMPROVEMENT_SETTINGS, useValue: settingsOf(values) },
        { provide: GENERATOR_SETTINGS, useValue: values.adapter },
        {
          provide: GENERATOR_SANDBOX,
          useFactory: (clock: Clock, ids: IdGenerator): Sandbox =>
            new DockerSandbox(values.sandbox, clock, ids),
          inject: [CLOCK, ID_GENERATOR],
        },
      ],
    };
  }

  /** Settings that cannot work stop the start, not the first request. */
  public onModuleInit(): void {
    checkImprovementSettings(this.settings, this.generator);
  }
}
