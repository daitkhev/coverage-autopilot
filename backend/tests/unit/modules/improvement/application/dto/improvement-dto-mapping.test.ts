import { describe, expect, it } from 'vitest';

import {
  budgetDtoOf,
  improvementDtoOf,
  type LiveFacts,
} from '#improvement/application/dto/improvement-dto-mapping';
import { BudgetUsage } from '#improvement/domain/value-objects/budget-usage.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  failureOf,
  improvementIn,
  skipOf,
  STEP_MINUTE,
} from '#tests/support/improvement-journeys';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  budgetOf,
  CREATED_AT,
  IMPROVEMENT_ID,
  minutesIn,
  REPOSITORY_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';

/** Where a test says the instance keeps the file of a reference. */
function pathOf(reference: string): string {
  return `/instance/artifacts/${reference}`;
}

const RESTING: LiveFacts = {
  usage: BudgetUsage.create({ attempts: 1, tokens: 1500, seconds: 300 }),
  progress: null,
  waitingFor: null,
};

describe('improvementDtoOf', () => {
  it('should show a completed improvement with its request, attempts and pull request', () => {
    const improvement = improvementIn('completed');

    expect(improvementDtoOf(improvement, RESTING, pathOf)).toEqual({
      id: IMPROVEMENT_ID,
      repositoryId: RepositoryId.create(REPOSITORY_ID),
      sourceSnapshotId: SOURCE_SNAPSHOT_ID,
      baselineSnapshotId: BASELINE_SNAPSHOT_ID,
      baseCommit: CommitSha.create(BASE_COMMIT),
      targetFile: FilePath.create(TARGET_FILE),
      status: 'completed',
      mode: 'automatic',
      waitingFor: null,
      phaseStartedAt: minutesIn(STEP_MINUTE.published),
      budget: { attempts: 3, tokens: null, minutes: 30 },
      usage: { attempts: 1, tokens: 1500, seconds: 300 },
      deadlineAt: improvement.deadlineAt,
      resumesAt: null,
      limitWaits: 0,
      qualityPolicy: {
        requiredChecks: ['test_files_only', 'new_tests_pass', 'mutation_gain'],
        repeatedRuns: 3,
        mutationThreshold: 60,
      },
      generator: {
        cli: 'claude_code',
        model: 'claude-sonnet',
        promptVersion: 'v1',
        billing: 'subscription',
      },
      attempts: [
        expect.objectContaining({
          number: 1,
          status: 'closed',
          rawOutputPaths: [
            pathOf('outputs/generator.json'),
            pathOf('outputs/new-tests.txt'),
          ],
        }) as unknown,
      ],
      progress: null,
      branch: `coverage-autopilot/${IMPROVEMENT_ID}`,
      pullRequest: { number: 42, url: 'https://github.com/acme/shop/pull/42' },
      failure: null,
      skip: null,
      createdAt: CREATED_AT,
      updatedAt: minutesIn(STEP_MINUTE.published),
      cancelledAt: null,
    });
  });

  it('should show a new improvement with nothing of its work yet', () => {
    expect(improvementDtoOf(improvementIn('created'), RESTING, pathOf)).toEqual(
      expect.objectContaining({
        baselineSnapshotId: null,
        deadlineAt: null,
        attempts: [],
        branch: null,
        pullRequest: null,
      }),
    );
  });

  it('should say why an improvement failed', () => {
    expect(improvementDtoOf(improvementIn('failed'), RESTING, pathOf)).toEqual(
      expect.objectContaining({
        failure: { reason: 'stale_snapshot', message: failureOf().message },
        skip: null,
      }),
    );
  });

  it('should say why an improvement was skipped', () => {
    expect(improvementDtoOf(improvementIn('skipped'), RESTING, pathOf)).toEqual(
      expect.objectContaining({
        failure: null,
        skip: { reason: 'threshold_met', message: skipOf().message },
      }),
    );
  });

  it('should say when an improvement was cancelled', () => {
    expect(
      improvementDtoOf(improvementIn('cancelled'), RESTING, pathOf).cancelledAt,
    ).toEqual(minutesIn(STEP_MINUTE.started));
  });

  it('should carry the facts of its job as they were given', () => {
    const progress = {
      steps: [{ code: 'type_check', status: 'running' }],
      updatedAt: minutesIn(9),
    } as const;

    const shown = improvementDtoOf(
      improvementIn('verifying'),
      { ...RESTING, progress, waitingFor: 'repository' },
      pathOf,
    );

    expect(shown.progress).toBe(progress);
    expect(shown.waitingFor).toBe('repository');
  });
});

describe('budgetDtoOf', () => {
  it('should give the three limits as plain numbers', () => {
    expect(budgetDtoOf(budgetOf({ tokens: 200_000 }))).toEqual({
      attempts: 3,
      tokens: 200_000,
      minutes: 30,
    });
  });
});
