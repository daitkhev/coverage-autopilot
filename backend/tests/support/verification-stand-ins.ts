import type {
  CoveragePublicApi,
  CoverageSnapshotDto,
  FileCoverageDto,
  PrepareProjectResult,
  RunCoverageDto,
  RunTestsRequest,
  RunTestsResult,
  WorkingCopyLoan,
} from '#coverage/contracts/coverage-public-api';
import { FilePath } from '#kernel/primitives/file-path';
import type {
  ApplyPatchRequest,
  ApplyPatchResult,
} from '#repositories/contracts/repositories-public-api';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';
import {
  measuredTarget,
  runCoverageOf,
  snapshotDto,
  testRunOf,
  VITEST_PARAMETERS,
} from '#tests/support/verification-coverage';
import {
  baselineRun,
  completedRunOf,
  killedByNewTest,
  undetectedLines,
} from '#tests/support/verification-mutants';
import { NEW_TEST_FILE } from '#tests/support/verification-requests';
import type {
  MutationRunner,
  MutationRunRequest,
  MutationRunResult,
  MutationToolRequest,
  MutationToolResult,
} from '#verification/application/ports/mutation-runner.port';
import type {
  TypeChecker,
  TypeCheckRequest,
  TypeCheckResult,
} from '#verification/application/ports/type-checker.port';
import type { VerificationSettings } from '#verification/application/verification-settings';

/** The settings of the verification module in a test. */
export const VERIFICATION_TEST_SETTINGS: VerificationSettings = {
  typeCheckTimeoutMs: 300_000,
  mutationRunTimeoutMs: 1_800_000,
  survivingMutantLimit: 2,
  commandEnvironment: { PATH: '/usr/local/bin:/usr/bin:/bin', CI: 'true' },
};

export interface StandInCoverage extends CoveragePublicApi {
  preparation: PrepareProjectResult;
  readonly prepared: WorkingCopyLoan[];
  readonly runs: RunTestsRequest[];
  /** Answered in order. Once none is left, every test passes. */
  readonly answers: RunTestsResult[];
  /** What a passing run with coverage measures: 6 of 10 lines. */
  measured: RunCoverageDto;
  snapshot: CoverageSnapshotDto | null;
  /** The target in the baseline snapshot: 4 of 10 lines. */
  baselineFile: FileCoverageDto | null;
  /** Runs before each answer, such as moving a clock. */
  onRun: () => void;
  /** Runs before each install of the packages answers. */
  onPrepare: () => void;
}

/**
 * The coverage module as the gate uses it, in memory: a Vitest project that
 * installs, and tests that pass and cover more of the target than the
 * baseline snapshot did.
 */
export function standInCoverage(): StandInCoverage {
  const stand: StandInCoverage = {
    preparation: {
      outcome: 'ready',
      project: {
        testRunner: 'vitest',
        testRunnerVersion: '4.1.12',
        packageManager: 'npm',
        configFile: null,
      },
      parameters: VITEST_PARAMETERS,
    },
    prepared: [],
    runs: [],
    answers: [],
    measured: runCoverageOf(measuredTarget({ covered: 6, total: 10 })),
    snapshot: snapshotDto(),
    baselineFile: measuredTarget({ covered: 4, total: 10 }),
    onRun: () => undefined,
    onPrepare: () => undefined,
    prepareProject: async (loan, signal) => {
      signal.throwIfAborted();
      stand.prepared.push(loan);
      stand.onPrepare();
      return Promise.resolve(stand.preparation);
    },
    runTests: async (request, signal) => {
      signal.throwIfAborted();
      stand.runs.push(request);
      stand.onRun();
      const passed = testRunOf(
        'passed',
        request.withCoverage ? stand.measured : null,
      );
      return Promise.resolve(stand.answers.shift() ?? passed);
    },
    captureSnapshot: async () =>
      Promise.reject(new Error('The gate never captures a snapshot.')),
    getSnapshot: async () => Promise.resolve(stand.snapshot),
    getFileCoverage: async () => Promise.resolve(stand.baselineFile),
  };
  return stand;
}

export interface ScriptedTypeChecker extends TypeChecker {
  result: TypeCheckResult;
  readonly requests: TypeCheckRequest[];
  /** Runs before each answer, such as moving a clock. */
  onCheck: () => void;
}

/** A compiler that finds no error, unless a test says otherwise. */
export function scriptedTypeChecker(): ScriptedTypeChecker {
  const checker: ScriptedTypeChecker = {
    result: {
      outcome: 'passes',
      durationMs: 700,
      outputReference: 'type-check',
    },
    requests: [],
    onCheck: () => undefined,
    check: async (request, signal) => {
      signal.throwIfAborted();
      checker.requests.push(request);
      checker.onCheck();
      return Promise.resolve(checker.result);
    },
  };
  return checker;
}

export interface ScriptedMutationRunner extends MutationRunner {
  installation: MutationToolResult;
  baseline: MutationRunResult;
  patched: MutationRunResult;
  readonly installs: MutationToolRequest[];
  readonly requests: MutationRunRequest[];
  /** Runs before each install answers, such as to note what ran before. */
  onInstall: () => void;
}

/**
 * A mutation tool that installs, answers `baselineRun` for the commit, and
 * for the patch a run in which the new test kills every mutant of the
 * baseline.
 */
export function scriptedMutationRunner(): ScriptedMutationRunner {
  const runner: ScriptedMutationRunner = {
    installation: { outcome: 'installed' },
    baseline: baselineRun(),
    patched: completedRunOf(undetectedLines().map(killedByNewTest)),
    installs: [],
    requests: [],
    onInstall: () => undefined,
    installTool: async (request, signal) => {
      signal.throwIfAborted();
      runner.installs.push(request);
      runner.onInstall();
      return Promise.resolve(runner.installation);
    },
    measureBaseline: async (request, signal) => {
      signal.throwIfAborted();
      runner.requests.push(request);
      return Promise.resolve(runner.baseline);
    },
    measureWithPatch: async (request, signal) => {
      signal.throwIfAborted();
      runner.requests.push(request);
      return Promise.resolve(runner.patched);
    },
  };
  return runner;
}

export interface PatchingRepositories extends StandInRepositories {
  /** What git answers to a patch: the new test file, unless a test says. */
  application: ApplyPatchResult;
  readonly patches: ApplyPatchRequest[];
}

/** The stand-in repositories, with a git that applies patches. */
export function patchingRepositories(): PatchingRepositories {
  const repositories: PatchingRepositories = {
    ...standInRepositories(),
    application: {
      outcome: 'applied',
      files: [FilePath.create(NEW_TEST_FILE)],
    },
    patches: [],
    applyPatch: async (request) => {
      repositories.patches.push(request);
      return Promise.resolve(repositories.application);
    },
  };
  return repositories;
}
