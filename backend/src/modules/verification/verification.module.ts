import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleInit,
} from '@nestjs/common';

import { BaselineMeasurement } from '#verification/application/commands/measure-baseline/baseline-measurement';
import { MeasureBaselineHandler } from '#verification/application/commands/measure-baseline/measure-baseline.handler';
import { CheckSequence } from '#verification/application/commands/verify-patch/check-sequence';
import { CompilerCheck } from '#verification/application/commands/verify-patch/checks/compiler-check';
import { CoverageIncreaseCheck } from '#verification/application/commands/verify-patch/checks/coverage-increase-check';
import { ExistingTestsCheck } from '#verification/application/commands/verify-patch/checks/existing-tests-check';
import { MutationGainCheck } from '#verification/application/commands/verify-patch/checks/mutation-gain-check';
import { NewTestsCheck } from '#verification/application/commands/verify-patch/checks/new-tests-check';
import { RepeatedRunsCheck } from '#verification/application/commands/verify-patch/checks/repeated-runs-check';
import { TestFilesOnlyCheck } from '#verification/application/commands/verify-patch/checks/test-files-only-check';
import { PatchVerification } from '#verification/application/commands/verify-patch/patch-verification';
import { VerifyPatchHandler } from '#verification/application/commands/verify-patch/verify-patch.handler';
import { MUTATION_RUNNER } from '#verification/application/ports/mutation-runner.port';
import { TYPE_CHECKER } from '#verification/application/ports/type-checker.port';
import { VerificationApi } from '#verification/application/verification-api';
import {
  VERIFICATION_SETTINGS,
  type VerificationSettings,
} from '#verification/application/verification-settings';
import { VERIFICATION_PUBLIC_API } from '#verification/contracts/verification-public-api';
import { TscTypeChecker } from '#verification/infrastructure/compiler/tsc-type-checker.adapter';
import {
  MUTATION_SETTINGS,
  type MutationSettings,
} from '#verification/infrastructure/mutation/mutation-settings';
import { StrykerMutationRunner } from '#verification/infrastructure/mutation/stryker-mutation-runner.adapter';
import { checkVerificationSettings } from '#verification/infrastructure/verification-settings.schema';

/** The settings of the gate and of the mutation tool, as plain values. */
interface VerificationValues {
  readonly gate: VerificationSettings;
  readonly mutation: MutationSettings;
}

/**
 * The quality gate: the seven checks of a test patch, and the measure of
 * a commit they are compared with. The module stores nothing.
 *
 * It takes from the modules around it: the contracts of `coverage` and
 * `repositories`, the sandbox, the store of tool output, the clock, and
 * the settings of the gate and of the mutation tool, which `register`
 * binds.
 */
@Module({
  providers: [
    { provide: TYPE_CHECKER, useClass: TscTypeChecker },
    { provide: MUTATION_RUNNER, useClass: StrykerMutationRunner },
    BaselineMeasurement,
    MeasureBaselineHandler,
    TestFilesOnlyCheck,
    CompilerCheck,
    NewTestsCheck,
    ExistingTestsCheck,
    RepeatedRunsCheck,
    CoverageIncreaseCheck,
    MutationGainCheck,
    CheckSequence,
    PatchVerification,
    VerifyPatchHandler,
    { provide: VERIFICATION_PUBLIC_API, useClass: VerificationApi },
  ],
  exports: [VERIFICATION_PUBLIC_API],
})
export class VerificationModule implements OnModuleInit {
  private readonly gate: VerificationSettings;
  private readonly mutation: MutationSettings;

  public constructor(
    @Inject(VERIFICATION_SETTINGS) gate: VerificationSettings,
    @Inject(MUTATION_SETTINGS) mutation: MutationSettings,
  ) {
    this.gate = gate;
    this.mutation = mutation;
  }

  /**
   * The module with its settings. It is global, so the module of an
   * improvement finds the contract of the gate.
   */
  public static register(values: VerificationValues): DynamicModule {
    return {
      module: VerificationModule,
      global: true,
      providers: [
        { provide: VERIFICATION_SETTINGS, useValue: values.gate },
        { provide: MUTATION_SETTINGS, useValue: values.mutation },
      ],
    };
  }

  /** Settings that cannot work stop the start, not the first patch. */
  public onModuleInit(): void {
    checkVerificationSettings(this.gate, this.mutation);
  }
}
