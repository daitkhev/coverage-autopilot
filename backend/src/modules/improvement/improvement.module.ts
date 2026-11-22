import { Inject, Module, type OnModuleInit } from '@nestjs/common';

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
import { ClaudeCodeGenerator } from '#improvement/infrastructure/generator/claude-code-generator.adapter';
import {
  GENERATOR_SETTINGS,
  type GeneratorSettings,
} from '#improvement/infrastructure/generator/generator-settings';
import { Sha256RequestHasher } from '#improvement/infrastructure/hashing/sha256-request-hasher.adapter';
import { checkImprovementSettings } from '#improvement/infrastructure/improvement-settings.schema';
import { SqliteImprovementRepository } from '#improvement/infrastructure/persistence/sqlite-improvement.repository';
import { AnswerStatus } from '#improvement/presentation/http/answer-status';
import { BudgetSettingsController } from '#improvement/presentation/http/budget-settings.controller';
import { ImprovementDecisionsController } from '#improvement/presentation/http/improvement-decisions.controller';
import { ImprovementRequestsController } from '#improvement/presentation/http/improvement-requests.controller';
import { ImprovementsController } from '#improvement/presentation/http/improvements.controller';
import { SnapshotFilesController } from '#improvement/presentation/http/snapshot-files.controller';

/** One step for each status that has work, in the order of the path. */
const STEPS = [AnalyzingStep, GeneratingStep, VerifyingStep, PublishingStep];

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
 * module and of the generator. The service lists `RunImprovementHandler`
 * among the handlers of its worker.
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
  private readonly settings: ImprovementSettings;
  private readonly generator: GeneratorSettings;

  public constructor(
    @Inject(IMPROVEMENT_SETTINGS) settings: ImprovementSettings,
    @Inject(GENERATOR_SETTINGS) generator: GeneratorSettings,
  ) {
    this.settings = settings;
    this.generator = generator;
  }

  /** Settings that cannot work stop the start, not the first request. */
  public onModuleInit(): void {
    checkImprovementSettings(this.settings, this.generator);
  }
}
