import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
  type DetectedProjectDto,
  type WorkingCopyLoan,
} from '#coverage/application/contracts/coverage-public-api';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/application/contracts/repositories-public-api';
import {
  type BaselineTests,
  baselineTestsOf,
} from '#verification/application/commands/measure-baseline/baseline-tests';
import type { MeasureBaselineCommand } from '#verification/application/commands/measure-baseline/measure-baseline.command';
import {
  done,
  refusalOf,
  type Step,
  stopped,
  testsStepOf,
  TIMED_OUT,
  unsupportedProject,
} from '#verification/application/commands/measure-baseline/measurement-step';
import type {
  BaselineProgress,
  MeasureBaselineResult,
  MutationBaselineDto,
  ProgressObserver,
  VerificationBaselineDto,
} from '#verification/application/contracts/verification-public-api';
import type { Deadline } from '#verification/application/deadline';
import {
  mutantOf,
  mutationBaselineDtoOf,
} from '#verification/application/dto/verification-dto-mapping';
import { leftOutTestFilesOf } from '#verification/application/failing-tests';
import {
  type CompletedMutationRun,
  MUTATION_RUNNER,
  type MutationRunner,
} from '#verification/application/ports/mutation-runner.port';
import {
  TYPE_CHECKER,
  type TypeChecker,
} from '#verification/application/ports/type-checker.port';
import {
  VERIFICATION_SETTINGS,
  type VerificationSettings,
} from '#verification/application/verification-settings';
import { MutationBaseline } from '#verification/domain/value-objects/mutation-baseline.vo';
import type { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

export interface Measurement {
  readonly command: MeasureBaselineCommand;
  readonly policy: QualityPolicy;
  readonly deadline: Deadline;
  readonly report: ProgressObserver<BaselineProgress>;
}

interface InCopy extends Measurement {
  readonly loan: WorkingCopyLoan;
}

/** What the steps before the mutants found, which their run depends on. */
interface FoundSoFar {
  readonly testRunner: DetectedProjectDto['testRunner'];
  readonly tests: BaselineTests;
}

function baselineOfRun(run: CompletedMutationRun): MutationBaselineDto {
  const mutants = run.mutants.map((each) => ({
    mutant: mutantOf(each),
    status: each.status,
  }));
  return mutationBaselineDtoOf(MutationBaseline.fromRun({ ...run, mutants }));
}

/**
 * Measures a commit in a working copy of its own: installs, type-checks,
 * runs every test once and, when the policy asks for it, installs the
 * mutation tool first and measures the mutants of the target last. The
 * copy is disposed of on every path: a result, a refusal, a fault and a
 * stop all release it.
 */
@Injectable()
export class BaselineMeasurement {
  private readonly repositories: RepositoriesPublicApi;
  private readonly coverage: CoveragePublicApi;
  private readonly typeChecker: TypeChecker;
  private readonly mutationRunner: MutationRunner;
  private readonly settings: VerificationSettings;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi,
    @Inject(TYPE_CHECKER) typeChecker: TypeChecker,
    @Inject(MUTATION_RUNNER) mutationRunner: MutationRunner,
    @Inject(VERIFICATION_SETTINGS) settings: VerificationSettings,
  ) {
    this.repositories = repositories;
    this.coverage = coverage;
    this.typeChecker = typeChecker;
    this.mutationRunner = mutationRunner;
    this.settings = settings;
  }

  public async measure(
    measurement: Measurement,
    signal: AbortSignal,
  ): Promise<MeasureBaselineResult> {
    const { command } = measurement;
    if (measurement.deadline.hasPassed()) {
      return { outcome: 'timed_out' };
    }
    measurement.report({ step: 'prepare', status: 'running' });
    const copy = await this.repositories.createWorkingCopy(
      {
        repositoryId: command.repositoryId,
        commit: command.commit,
        purpose: `verification:baseline:${command.owner}`,
      },
      signal,
    );
    const loan = {
      workingCopyPath: copy.path,
      repositoryId: copy.repositoryId,
      owner: command.owner,
    };
    try {
      return await this.measureIn({ ...measurement, loan }, signal);
    } finally {
      await this.repositories.disposeWorkingCopy({ workingCopyId: copy.id });
    }
  }

  private async measureIn(
    measurement: InCopy,
    signal: AbortSignal,
  ): Promise<MeasureBaselineResult> {
    const runner = await this.prepare(measurement, signal);
    if (runner.outcome === 'stopped') {
      return runner.result;
    }
    const typeCheck = await this.typeCheck(measurement, signal);
    if (typeCheck.outcome === 'stopped') {
      return typeCheck.result;
    }
    const tests = await this.existingTests(measurement, signal);
    if (tests.outcome === 'stopped') {
      return tests.result;
    }
    const mutation = await this.mutation(
      measurement,
      { testRunner: runner.value, tests: tests.value },
      signal,
    );
    if (mutation.outcome === 'stopped') {
      return mutation.result;
    }
    const baseline: VerificationBaselineDto = {
      commit: measurement.command.commit,
      targetFile: measurement.command.targetFile,
      typeCheck: typeCheck.value,
      ...tests.value,
      mutation: mutation.value,
    };
    return { outcome: 'measured', baseline };
  }

  private async prepare(
    measurement: InCopy,
    signal: AbortSignal,
  ): Promise<Step<DetectedProjectDto['testRunner']>> {
    if (measurement.deadline.hasPassed()) {
      return TIMED_OUT;
    }
    const preparation = await this.coverage.prepareProject(
      measurement.loan,
      signal,
    );
    const step =
      preparation.outcome === 'ready'
        ? await this.installTool(
            measurement,
            preparation.project.testRunner,
            signal,
          )
        : refusalOf(preparation);
    measurement.report({ step: 'prepare', status: 'done' });
    return step;
  }

  /**
   * The install of the mutation tool is the one step with an open network,
   * so it comes before any code of the repository runs in the copy.
   */
  private async installTool(
    measurement: InCopy,
    testRunner: DetectedProjectDto['testRunner'],
    signal: AbortSignal,
  ): Promise<Step<DetectedProjectDto['testRunner']>> {
    if (!measurement.policy.requires('mutation_gain')) {
      return done(testRunner);
    }
    if (measurement.deadline.hasPassed()) {
      return TIMED_OUT;
    }
    const tool = await this.mutationRunner.installTool(
      { ...measurement.loan, testRunner },
      signal,
    );
    return tool.outcome === 'installed'
      ? done(testRunner)
      : stopped({ ...tool, reason: 'mutation_unsupported' });
  }

  private async typeCheck(
    measurement: InCopy,
    signal: AbortSignal,
  ): Promise<Step<VerificationBaselineDto['typeCheck']>> {
    const { loan, deadline } = measurement;
    const result = await this.inStep(measurement, 'type_check', async () =>
      this.typeChecker.check(
        {
          ...loan,
          timeoutMs: deadline.limit(this.settings.typeCheckTimeoutMs),
        },
        signal,
      ),
    );
    return result === null || result.outcome === 'timed_out'
      ? TIMED_OUT
      : done(result.outcome);
  }

  private async existingTests(
    measurement: InCopy,
    signal: AbortSignal,
  ): Promise<Step<BaselineTests>> {
    const result = await this.inStep(measurement, 'existing_tests', async () =>
      this.coverage.runTests(
        { ...measurement.loan, testFiles: [], withCoverage: false },
        signal,
      ),
    );
    if (result === null) {
      return TIMED_OUT;
    }
    return result.outcome === 'completed'
      ? testsStepOf(
          baselineTestsOf(result.testRun, this.settings.baselineTests),
        )
      : unsupportedProject(result.detail);
  }

  private async mutation(
    measurement: InCopy,
    found: FoundSoFar,
    signal: AbortSignal,
  ): Promise<Step<MutationBaselineDto | null>> {
    const { command, deadline, loan } = measurement;
    if (!measurement.policy.requires('mutation_gain')) {
      return done(null);
    }
    const result = await this.inStep(
      measurement,
      'mutation_baseline',
      async () =>
        this.mutationRunner.measureBaseline(
          {
            ...loan,
            targetFile: command.targetFile,
            leftOutTestFiles: leftOutTestFilesOf(found.tests.failingTests),
            testRunner: found.testRunner,
            timeoutMs: deadline.limit(this.settings.mutationRunTimeoutMs),
          },
          signal,
        ),
    );
    if (result === null || result.outcome === 'timed_out') {
      return TIMED_OUT;
    }
    return result.outcome === 'completed'
      ? done(baselineOfRun(result))
      : stopped({ ...result, reason: 'mutation_unsupported' });
  }

  /** A step run only while time is left, told to the observer. */
  private async inStep<Value>(
    measurement: InCopy,
    step: BaselineProgress['step'],
    work: () => Promise<Value>,
  ): Promise<Value | null> {
    if (measurement.deadline.hasPassed()) {
      return null;
    }
    measurement.report({ step, status: 'running' });
    const value = await work();
    measurement.report({ step, status: 'done' });
    return value;
  }
}
