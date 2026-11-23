import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import {
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import type {
  CheckName,
  MeasureBaselineRequest,
  QualityPolicyDto,
  VerificationBaselineDto,
  VerifyPatchRequest,
} from '#verification/application/contracts/verification-public-api';

/** The moment every clock of a verification test starts at. */
export const NOW = '2026-11-21T10:00:00.000Z';

/** An hour after `NOW`. */
export const DEADLINE = '2026-11-21T11:00:00.000Z';

export const HOUR_MS = 3_600_000;

/** The file every improvement of a test aims at. */
export const TARGET_FILE = 'src/used.ts';

/** The test file every patch of a test adds, unless it says otherwise. */
export const NEW_TEST_FILE = 'src/used.test.ts';

export const ALL_CHECKS: readonly CheckName[] = [
  'test_files_only',
  'type_check',
  'new_tests_pass',
  'existing_tests_pass',
  'repeated_runs',
  'coverage_increase',
  'mutation_gain',
];

/** Every check required, three runs in a row, half of the mutants. */
export function policyOf(
  overrides: Partial<QualityPolicyDto> = {},
): QualityPolicyDto {
  return {
    requiredChecks: ALL_CHECKS,
    repeatedRuns: 3,
    mutationThreshold: 50,
    ...overrides,
  };
}

/** Every check required but the ones a test names. */
export function policyWithout(...names: CheckName[]): QualityPolicyDto {
  return policyOf({
    requiredChecks: ALL_CHECKS.filter((name) => !names.includes(name)),
  });
}

export function measureRequestOf(
  overrides: Partial<MeasureBaselineRequest> = {},
): MeasureBaselineRequest {
  return {
    repositoryId: RepositoryId.create(REPOSITORY_ID),
    commit: CommitSha.create(SNAPSHOT_COMMIT),
    targetFile: FilePath.create(TARGET_FILE),
    policy: policyOf(),
    deadline: Instant.parse(DEADLINE),
    owner: 'improvement:7',
    ...overrides,
  };
}

/** A patch as `git diff` writes one that adds a file with these lines. */
export function newFilePatch(
  path: string = NEW_TEST_FILE,
  lines: readonly string[] = [
    "import { it } from 'vitest';",
    "it('adds', () => {});",
  ],
): string {
  const length = lines.length === 1 ? '' : `,${String(lines.length)}`;
  return [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    'index 0000000..3b18e51',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1${length} @@`,
    ...lines.map((line) => `+${line}`),
    '',
  ].join('\n');
}

/** The commit type-checks and its tests pass. No mutation measure. */
export function baselineOf(
  overrides: Partial<VerificationBaselineDto> = {},
): VerificationBaselineDto {
  return {
    commit: CommitSha.create(SNAPSHOT_COMMIT),
    targetFile: FilePath.create(TARGET_FILE),
    typeCheck: 'passes',
    existingTests: 'passed',
    failingTests: [],
    mutation: null,
    ...overrides,
  };
}

export function verifyRequestOf(
  overrides: Partial<VerifyPatchRequest> = {},
): VerifyPatchRequest {
  return {
    repositoryId: RepositoryId.create(REPOSITORY_ID),
    baseCommit: CommitSha.create(SNAPSHOT_COMMIT),
    patch: { text: newFilePatch(), hash: 'patch-hash' },
    targetFile: FilePath.create(TARGET_FILE),
    testFileSuffixes: ['.test.ts', '.test.tsx'],
    baselineSnapshotId: SNAPSHOT_ID,
    baseline: baselineOf(),
    policy: policyWithout('mutation_gain'),
    deadline: Instant.parse(DEADLINE),
    owner: 'improvement:7:attempt:1',
    ...overrides,
  };
}
