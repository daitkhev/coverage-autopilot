import { describe, expect, it } from 'vitest';

import {
  askedImprovementOf,
  canonicalTextOf,
  improvementRequestOf,
  type SourceOfWork,
} from '#improvement/application/commands/start-improvement/requested-improvement';
import { BudgetAboveMaximumError } from '#improvement/domain/errors/budget-above-maximum.error';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import { InvalidFilePathError } from '#kernel/errors/invalid-file-path.error';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { startCommandOf } from '#tests/support/improvement-request-stand-ins';
import {
  BASE_COMMIT,
  hashOf,
  REPOSITORY_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
  TEST_SETTINGS,
} from '#tests/support/improvement-values';

const SOURCE: SourceOfWork = {
  repositoryId: RepositoryId.create(REPOSITORY_ID),
  commit: CommitSha.create(BASE_COMMIT),
};

const POLICY = {
  requiredChecks: ['mutation_gain', 'test_files_only'],
  repeatedRuns: 4,
  mutationThreshold: 75,
} as const;

function askedOf(spec: Parameters<typeof startCommandOf>[0] = {}) {
  return askedImprovementOf(startCommandOf(spec), TEST_SETTINGS);
}

describe('askedImprovementOf', () => {
  it('should fill every choice the command left out from the settings', () => {
    const asked = askedOf();

    expect(asked.key.value).toBe('request-1');
    expect(asked.snapshotId.value).toBe(SOURCE_SNAPSHOT_ID);
    expect(asked.targetFile.value).toBe(TARGET_FILE);
    expect(asked.mode).toBe('automatic');
    expect(asked.budget).toEqual(TEST_SETTINGS.budget.defaults);
    expect(asked.policy).toBe(TEST_SETTINGS.policy);
    expect(asked.generator).toBe(TEST_SETTINGS.generator);
  });

  it('should keep the choices of the command, within the maximums', () => {
    const asked = askedOf({
      mode: 'review',
      budget: { minutes: 120 },
      qualityPolicy: POLICY,
    });

    expect(asked.mode).toBe('review');
    expect(asked.budget.limits).toEqual({
      attempts: 3,
      tokens: null,
      minutes: 120,
    });
    expect(asked.policy.requiredChecks).toEqual(POLICY.requiredChecks);
    expect(asked.policy.mutationThreshold).toBe(75);
  });

  it('should take the CLI and the model of the command, and the prompt and the billing of the service', () => {
    const asked = askedOf({
      generator: { cli: 'claude_code', model: 'claude-opus' },
    });

    expect(asked.generator.model).toBe('claude-opus');
    expect(asked.generator.promptVersion).toBe('v1');
    expect(asked.generator.billing).toBe('subscription');
  });

  describe('when a value breaks a rule of the domain', () => {
    it.each([
      ['a request key', { requestKey: '' }, InvalidImprovementValueError],
      ['a snapshot id', { snapshotId: 'latest' }, InvalidImprovementValueError],
      ['a path', { filePath: '/src/price.ts' }, InvalidFilePathError],
      [
        'a policy',
        { qualityPolicy: { ...POLICY, mutationThreshold: 101 } },
        InvalidImprovementValueError,
      ],
      [
        'a model',
        { generator: { cli: 'claude_code', model: '' } },
        InvalidImprovementValueError,
      ],
    ] as const)('should throw the error of %s', (_value, spec, error) => {
      expect(() => askedOf(spec)).toThrow(error);
    });

    it.each([
      ['more attempts', { attempts: 11 }],
      ['more minutes', { minutes: 121 }],
      ['a limit of tokens under a subscription', { tokens: 100_000 }],
    ])(
      'should refuse a budget with %s than the service allows',
      (_case, budget) => {
        expect(() => askedOf({ budget })).toThrow(BudgetAboveMaximumError);
      },
    );
  });
});

describe('canonicalTextOf', () => {
  it('should write the work in a fixed order of keys', () => {
    expect(canonicalTextOf(askedOf(), SOURCE)).toBe(
      `{"repositoryId":"${REPOSITORY_ID}","baseCommit":"${BASE_COMMIT}",` +
        `"targetFile":"${TARGET_FILE}","qualityPolicy":{"requiredChecks":` +
        '["test_files_only","new_tests_pass","mutation_gain"],' +
        '"repeatedRuns":3,"mutationThreshold":60},"generator":' +
        '{"cli":"claude_code","model":"claude-sonnet","promptVersion":"v1"}}',
    );
  });

  it('should leave out the key, the budget and the mode', () => {
    const plain = canonicalTextOf(askedOf(), SOURCE);

    expect(
      canonicalTextOf(
        askedOf({
          requestKey: 'request-2',
          budget: { attempts: 10 },
          mode: 'review',
        }),
        SOURCE,
      ),
    ).toBe(plain);
  });

  it('should list the checks in the order they run, whatever order they came in', () => {
    const reversed = canonicalTextOf(
      askedOf({ qualityPolicy: POLICY }),
      SOURCE,
    );
    const ordered = canonicalTextOf(
      askedOf({
        qualityPolicy: {
          ...POLICY,
          requiredChecks: ['test_files_only', 'mutation_gain'],
        },
      }),
      SOURCE,
    );

    expect(reversed).toBe(ordered);
    expect(reversed).toContain('["test_files_only","mutation_gain"]');
  });

  it.each([
    ['another file', { filePath: 'src/tax.ts' }],
    ['another policy', { qualityPolicy: POLICY }],
    [
      'another model',
      { generator: { cli: 'claude_code', model: 'claude-opus' } },
    ],
  ] as const)('should differ for %s', (_case, spec) => {
    expect(canonicalTextOf(askedOf(spec), SOURCE)).not.toBe(
      canonicalTextOf(askedOf(), SOURCE),
    );
  });
});

describe('improvementRequestOf', () => {
  it('should make the request on the repository and the commit of the source', () => {
    const fingerprint = RequestFingerprint.create(hashOf('f'));

    const request = improvementRequestOf(askedOf(), SOURCE, fingerprint);

    expect(request.repositoryId).toBe(SOURCE.repositoryId);
    expect(request.baseCommit).toBe(SOURCE.commit);
    expect(request.sourceSnapshotId.value).toBe(SOURCE_SNAPSHOT_ID);
    expect(request.fingerprint).toBe(fingerprint);
    expect(request.key.value).toBe('request-1');
  });
});
