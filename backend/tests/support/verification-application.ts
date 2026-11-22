import { FilePath } from '#kernel/primitives/file-path';
import { Instant } from '#kernel/time/instant';
import { FixedClock } from '#tests/support/fixed-clock';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';
import { mutationBaselineDto } from '#tests/support/verification-mutants';
import {
  DEADLINE,
  NEW_TEST_FILE,
  NOW,
  policyOf,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import {
  type PatchingRepositories,
  patchingRepositories,
  type ScriptedMutationRunner,
  scriptedMutationRunner,
  type ScriptedTypeChecker,
  scriptedTypeChecker,
  type StandInCoverage,
  standInCoverage,
  VERIFICATION_TEST_SETTINGS,
} from '#tests/support/verification-stand-ins';
import { BaselineMeasurement } from '#verification/application/commands/measure-baseline/baseline-measurement';
import { MeasureBaselineHandler } from '#verification/application/commands/measure-baseline/measure-baseline.handler';
import { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import { CheckSequence } from '#verification/application/commands/verify-patch/check-sequence';
import { CompilerCheck } from '#verification/application/commands/verify-patch/checks/compiler-check';
import { CoverageIncreaseCheck } from '#verification/application/commands/verify-patch/checks/coverage-increase-check';
import { ExistingTestsCheck } from '#verification/application/commands/verify-patch/checks/existing-tests-check';
import { MutationGainCheck } from '#verification/application/commands/verify-patch/checks/mutation-gain-check';
import { NewTestsCheck } from '#verification/application/commands/verify-patch/checks/new-tests-check';
import { RepeatedRunsCheck } from '#verification/application/commands/verify-patch/checks/repeated-runs-check';
import { TestFilesOnlyCheck } from '#verification/application/commands/verify-patch/checks/test-files-only-check';
import { PatchVerification } from '#verification/application/commands/verify-patch/patch-verification';
import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import { SharedTestRun } from '#verification/application/commands/verify-patch/shared-test-run';
import { VerifyPatchHandler } from '#verification/application/commands/verify-patch/verify-patch.handler';
import type { CheckProgress } from '#verification/application/contracts/verification-public-api';
import { Deadline } from '#verification/application/deadline';
import { mutationBaselineOf } from '#verification/application/dto/verification-dto-mapping';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

/** Every stand-in of the gate, and the parts wired over them. */
export interface VerificationApplication {
  readonly clock: FixedClock;
  readonly repositories: PatchingRepositories;
  readonly coverage: StandInCoverage;
  readonly typeChecker: ScriptedTypeChecker;
  readonly mutationRunner: ScriptedMutationRunner;
  readonly sequence: CheckSequence;
  readonly measurement: BaselineMeasurement;
  readonly verification: PatchVerification;
  readonly baselineHandler: MeasureBaselineHandler;
  readonly patchHandler: VerifyPatchHandler;
}

type StandIns = Pick<
  VerificationApplication,
  'clock' | 'repositories' | 'coverage' | 'typeChecker' | 'mutationRunner'
>;

function sequenceOf(parts: StandIns): CheckSequence {
  const settings = VERIFICATION_TEST_SETTINGS;
  return new CheckSequence(
    new CompilerCheck(parts.typeChecker, settings),
    new NewTestsCheck(parts.coverage),
    new ExistingTestsCheck(),
    new RepeatedRunsCheck(parts.coverage),
    new CoverageIncreaseCheck(parts.coverage),
    new MutationGainCheck(parts.mutationRunner, settings),
    parts.clock,
  );
}

/**
 * The application of the verification module over stand-ins: a commit
 * that installs, type-checks and passes its tests, and a patch that adds a
 * test that passes, covers more and kills every undetected mutant. A test
 * changes a stand-in to take another path.
 */
export function verificationApplication(): VerificationApplication {
  const parts: StandIns = {
    clock: new FixedClock(NOW),
    repositories: patchingRepositories(),
    coverage: standInCoverage(),
    typeChecker: scriptedTypeChecker(),
    mutationRunner: scriptedMutationRunner(),
  };
  const sequence = sequenceOf(parts);
  const testFilesOnly = new TestFilesOnlyCheck(parts.repositories);
  const measurement = new BaselineMeasurement(
    parts.repositories,
    parts.coverage,
    parts.typeChecker,
    parts.mutationRunner,
    VERIFICATION_TEST_SETTINGS,
  );
  const verification = new PatchVerification(
    parts.repositories,
    parts.coverage,
    parts.mutationRunner,
    testFilesOnly,
    sequence,
  );
  return {
    ...parts,
    sequence,
    measurement,
    verification,
    baselineHandler: new MeasureBaselineHandler(measurement, parts.clock),
    patchHandler: new VerifyPatchHandler(
      testFilesOnly,
      verification,
      parts.clock,
    ),
  };
}

/** How far the work in the copy had gone when the mutation tool installed. */
export interface SeenAtInstall {
  readonly prepared: number;
  readonly typeChecks: number;
  readonly testRuns: number;
}

/** Notes, at each install of the mutation tool, what had run before it. */
export function seenAtInstall(
  application: VerificationApplication,
): SeenAtInstall[] {
  const seen: SeenAtInstall[] = [];
  const { coverage, typeChecker, mutationRunner } = application;
  mutationRunner.onInstall = () => {
    seen.push({
      prepared: coverage.prepared.length,
      typeChecks: typeChecker.requests.length,
      testRuns: coverage.runs.length,
    });
  };
  return seen;
}

/** A patched copy of the stand-ins, and what its listener heard. */
export interface CopyBench {
  readonly copy: PatchedCopy;
  readonly heard: CheckProgress[];
}

/**
 * A copy with the new test file applied and every check required, the
 * mutation check with the baseline of `mutationBaselineDto`.
 */
export function patchedCopyOf(
  application: VerificationApplication,
  overrides: Partial<PatchedCopy> = {},
): CopyBench {
  const heard: CheckProgress[] = [];
  const loan = {
    workingCopyPath: WORKING_COPY_PATH,
    owner: 'improvement:7:attempt:1',
  };
  const { coverage, clock } = application;
  const copy: PatchedCopy = {
    command: verifyRequestOf(),
    policy: QualityPolicy.create(policyOf()),
    mutationBaseline: mutationBaselineOf(mutationBaselineDto()),
    loan,
    testRunner: 'vitest',
    mutationTool: { outcome: 'installed' },
    newTestFiles: [FilePath.create(NEW_TEST_FILE)],
    deadline: new Deadline(clock, Instant.parse(DEADLINE)),
    book: new CheckBook((progress) => heard.push(progress)),
    fullRun: new SharedTestRun(async (signal) =>
      coverage.runTests({ ...loan, testFiles: [], withCoverage: true }, signal),
    ),
    evidence: { coverage: null, mutation: null },
    ...overrides,
  };
  return { copy, heard };
}
