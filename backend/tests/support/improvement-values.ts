import type { ImprovementSettings } from '#improvement/application/improvement-settings';
import {
  Budget,
  type BudgetLimits,
} from '#improvement/domain/value-objects/budget.vo';
import { BudgetSettings } from '#improvement/domain/value-objects/budget-settings.vo';
import type { Generation } from '#improvement/domain/value-objects/generation.vo';
import {
  type Billing,
  GeneratorConfig,
} from '#improvement/domain/value-objects/generator-config.vo';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import type { ImprovementMode } from '#improvement/domain/value-objects/improvement-mode.vo';
import { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import type { Mutant } from '#improvement/domain/value-objects/mutant.vo';
import { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';
import { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import {
  type FailingTest,
  type MutationBaseline,
  VerificationBaseline,
  type VerificationBaselineProps,
} from '#improvement/domain/value-objects/verification-baseline.vo';
import {
  type CheckResult,
  type TestFailure,
  type Verdict,
  VerificationReport,
  type VerificationReportProps,
} from '#improvement/domain/value-objects/verification-report.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';

const SHA1_DIGITS = 40;
const SHA256_DIGITS = 64;
const MS_PER_MINUTE = 60_000;

export const IMPROVEMENT_ID = '00000000-0000-4000-8000-000000000101';
export const REPOSITORY_ID = '00000000-0000-4000-8000-000000000102';
export const SOURCE_SNAPSHOT_ID = '00000000-0000-4000-8000-000000000103';
export const BASELINE_SNAPSHOT_ID = '00000000-0000-4000-8000-000000000104';
export const BASE_COMMIT = 'b'.repeat(SHA1_DIGITS);
export const TARGET_FILE = 'src/price.ts';

/** When every improvement of a test is created. */
export const CREATED_AT = Instant.parse('2026-05-01T10:00:00.000Z');

/** The moment so many minutes after the creation. */
export function minutesIn(minutes: number): Instant {
  return CREATED_AT.plusMilliseconds(minutes * MS_PER_MINUTE);
}

/** A SHA-256 hash in hex made of one digit, so a test can tell two apart. */
export function hashOf(digit: string): string {
  return digit.repeat(SHA256_DIGITS);
}

export function patchOf(digit = 'a'): TestPatch {
  return TestPatch.create({
    text: `diff --git a/src/price.test.ts b/src/price.test.ts ${digit}`,
    hash: hashOf(digit),
  });
}

/** The limits of the budget of every request unless a test names others. */
export const LIMITS = { attempts: 3, tokens: null, minutes: 30 } as const;

export function budgetOf(limits: Partial<BudgetLimits> = {}): Budget {
  return Budget.create({ ...LIMITS, ...limits });
}

export function policyOf(): QualityPolicy {
  return QualityPolicy.create({
    requiredChecks: ['test_files_only', 'new_tests_pass', 'mutation_gain'],
    repeatedRuns: 3,
    mutationThreshold: 60,
  });
}

export function generatorOf(
  billing: Billing = 'subscription',
): GeneratorConfig {
  return GeneratorConfig.create({
    cli: 'claude_code',
    model: 'claude-sonnet',
    promptVersion: 'v1',
    billing,
  });
}

/**
 * The settings of the improvement module in every test, those of the
 * decisions: 3 attempts of 10 and 30 minutes of 120 by default, under a
 * subscription, so with no limit of tokens and no price of a call.
 */
export const TEST_SETTINGS: ImprovementSettings = {
  budget: BudgetSettings.create({
    defaults: budgetOf(),
    maximums: budgetOf({ attempts: 10, minutes: 120 }),
  }),
  mode: 'automatic',
  policy: policyOf(),
  generator: generatorOf(),
  generation: { maxTurns: 12, maxCostUsd: null, timeoutMs: 600_000 },
  testFileSuffixes: ['.test.ts', '.test.tsx'],
  limitWaitMs: 3_600_000,
  missingCredential: null,
};

/** What a request may change in a test. The rest is a fixed request. */
export interface RequestSpec {
  readonly mode?: ImprovementMode;
  readonly key?: string;
  readonly fingerprint?: string;
  readonly targetFile?: string;
  readonly repositoryId?: string;
  readonly sourceSnapshotId?: string;
  readonly budget?: Budget;
  readonly billing?: Billing;
}

export function requestOf(spec: RequestSpec = {}): ImprovementRequest {
  const chosen: Required<RequestSpec> = {
    mode: 'automatic',
    key: 'request-1',
    fingerprint: hashOf('f'),
    targetFile: TARGET_FILE,
    repositoryId: REPOSITORY_ID,
    sourceSnapshotId: SOURCE_SNAPSHOT_ID,
    budget: budgetOf(),
    billing: 'subscription',
    ...spec,
  };
  return ImprovementRequest.create({
    repositoryId: RepositoryId.create(chosen.repositoryId),
    sourceSnapshotId: SnapshotId.create(chosen.sourceSnapshotId),
    baseCommit: CommitSha.create(BASE_COMMIT),
    targetFile: FilePath.create(chosen.targetFile),
    mode: chosen.mode,
    key: RequestKey.create(chosen.key),
    fingerprint: RequestFingerprint.create(chosen.fingerprint),
    policy: policyOf(),
    generator: generatorOf(chosen.billing),
    budget: chosen.budget,
  });
}

export function improvementIdOf(id = IMPROVEMENT_ID): ImprovementId {
  return ImprovementId.create(id);
}

/** The one mutant of the target that no test notices. */
function mutantOf(): Mutant {
  return {
    file: FilePath.create(TARGET_FILE),
    mutator: 'EqualityOperator',
    startLine: 3,
    startColumn: 9,
    endLine: 3,
    endColumn: 14,
    replacement: 'price >= 0',
  };
}

export function mutationOf(): MutationBaseline {
  return {
    tool: { name: 'stryker', version: '10.1.1', testRunner: 'vitest' },
    totalMutants: 4,
    mutantSetHash: hashOf('c'),
    undetected: [{ ...mutantOf(), status: 'survived' }],
    cacheReference: 'artifacts/stryker-cache.json',
  };
}

/** A test that failed before the patch, and a file that failed to run. */
export const FAILING_TESTS: readonly FailingTest[] = [
  {
    file: FilePath.create('tests/feed.test.ts'),
    test: 'feed > reads the feed',
  },
  { file: FilePath.create('tests/clock.test.ts'), test: null },
];

/** The baseline of the gate at the base commit, with one missed mutant. */
export function baselineOf(
  spec: Partial<VerificationBaselineProps> = {},
): VerificationBaseline {
  return VerificationBaseline.create({
    commit: CommitSha.create(BASE_COMMIT),
    targetFile: FilePath.create(TARGET_FILE),
    typeCheck: 'passes',
    existingTests: 'passed',
    failingTests: [],
    mutation: mutationOf(),
    ...spec,
  });
}

/** A check whose status matches the verdict of the report it is in. */
export function checkOf(
  name: CheckResult['name'],
  verdict: Verdict,
): CheckResult {
  const status = {
    accepted: 'passed',
    rejected: 'failed',
    inconclusive: 'error',
  } as const;
  return {
    name,
    status: status[verdict],
    retryable: verdict === 'inconclusive',
    durationMs: 1200,
    runs: null,
    message: verdict === 'accepted' ? null : 'The new test does not pass.',
    outputReference: 'outputs/new-tests.txt',
    testFailure: null,
  };
}

/** A report of the gate on the patch of `digit`, with one check. */
export function reportOf(verdict: Verdict, digit = 'a'): VerificationReport {
  return VerificationReport.create(reportPropsOf(verdict, digit));
}

/** What the run of the new tests said first: their file failed to run. */
export const RUN_FAILURE: TestFailure = {
  file: FilePath.create('tests/helpers/utils.test.ts'),
  test: null,
  lines: [
    '● Test suite failed to run',
    "src/helpers/utils.ts:3:25 - error TS2307: Cannot find module 'crypto' or its corresponding type declarations.",
  ],
};

/** A rejection of new tests whose run said what `RUN_FAILURE` says. */
export function failedRunReportProps(): VerificationReportProps {
  const props = reportPropsOf('rejected');
  return {
    ...props,
    checks: props.checks.map((check) => ({
      ...check,
      testFailure: RUN_FAILURE,
    })),
  };
}

export function reportPropsOf(
  verdict: Verdict,
  digit = 'a',
): VerificationReportProps {
  const counts = { covered: 3, total: 4 };
  return {
    patchHash: hashOf(digit),
    verdict,
    reasons: verdict === 'accepted' ? [] : ['The new test does not pass.'],
    checks: [checkOf('new_tests_pass', verdict)],
    coverageBefore: {
      statements: counts,
      branches: counts,
      functions: counts,
      lines: counts,
    },
    coverageAfter: null,
    mutants: { undetectedBefore: 1, killed: 0, reached: 1, timedOut: 0 },
    survivingMutants: [{ ...mutantOf(), reached: true }],
  };
}

/** What a call reports besides its outcome. */
const CALL = {
  tokensUsed: 1500,
  outputReference: 'outputs/generator.json',
  refusedToolCalls: [],
} as const;

/** A call of the generator that wrote the patch of `digit`. */
export function generatedOf(digit = 'a'): Generation {
  return { ...CALL, outcome: 'generated', patch: patchOf(digit) };
}

/** A call of the generator that ended with an outcome other than a patch. */
export function endedWith(
  outcome:
    'no_changes' | 'limit_reached' | 'quota_exhausted' | 'credential_exposed',
): Generation {
  return { ...CALL, outcome };
}

/** A call that found the five-hour window spent. */
export function windowSpentUntil(resumesAt: Instant): Generation {
  return { ...CALL, outcome: 'window_exhausted', resumesAt };
}
