import { describe, expect, it } from 'vitest';

import {
  captureEnding,
  measureEnding,
  revisionEnding,
  targetEnding,
} from '#improvement/application/commands/run-improvement/analysis-endings';
import type { Change } from '#improvement/application/commands/run-improvement/run-failures';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { gateBaselineOf } from '#tests/support/improvement-handler-modules';
import { improvementIn } from '#tests/support/improvement-journeys';
import {
  BASE_COMMIT,
  minutesIn,
  mutationOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';
import { measuredTarget } from '#tests/support/verification-coverage';

const HEAD = 'd'.repeat(BASE_COMMIT.length);

const TARGET = FilePath.create(TARGET_FILE);

/** How an improvement in `analyzing` ends with the change. */
function endingOf(change: Change | null): unknown {
  const improvement = improvementIn('analyzing');
  change?.(improvement, minutesIn(11));
  const ending = improvement.failure ?? improvement.skip;
  return {
    status: improvement.status,
    reason: ending?.reason,
    message: ending?.message,
  };
}

function revisionOf(outcome: 'current' | 'unchanged' | 'stale' | 'diverged') {
  return revisionEnding(
    { outcome, headCommit: CommitSha.create(HEAD) },
    improvementIn('analyzing').request,
  );
}

describe('revisionEnding', () => {
  it('should go on while the file is the same at the head', () => {
    expect(revisionOf('current')).toBeNull();
    expect(revisionOf('unchanged')).toBeNull();
  });

  it('should fail with stale_snapshot when the file changed', () => {
    expect(endingOf(revisionOf('stale'))).toEqual({
      status: 'failed',
      reason: 'stale_snapshot',
      message:
        `${TARGET_FILE} changed on the default branch between ` +
        `${BASE_COMMIT} and its head ${HEAD}.`,
    });
  });

  it('should fail with stale_snapshot when the commit left the branch', () => {
    expect(endingOf(revisionOf('diverged'))).toEqual({
      status: 'failed',
      reason: 'stale_snapshot',
      message:
        `${BASE_COMMIT} is no longer an ancestor of the head ${HEAD} of ` +
        'the default branch.',
    });
  });
});

describe('captureEnding', () => {
  it('should name the outcome and the reason of a project it cannot measure', () => {
    const ending = captureEnding({
      outcome: 'unsupported',
      reason: 'monorepo',
      detail: 'package.json declares workspaces.',
    });

    expect(endingOf(ending)).toEqual({
      status: 'failed',
      reason: 'verification_error',
      message:
        'The fresh snapshot ended in unsupported, for the reason monorepo: ' +
        'package.json declares workspaces.',
    });
  });

  it('should name where the output of a failed install is', () => {
    const ending = captureEnding({
      outcome: 'install_failed',
      outputReference: 'artifact-1',
    });

    expect(endingOf(ending)).toMatchObject({
      message:
        'The fresh snapshot ended in install_failed, with its output in ' +
        'artifact-1.',
    });
  });

  it('should say when no output was kept', () => {
    const ending = captureEnding({
      outcome: 'test_run_timed_out',
      outputReference: null,
    });

    expect(endingOf(ending)).toMatchObject({
      message:
        'The fresh snapshot ended in test_run_timed_out, and no output was ' +
        'kept.',
    });
  });
});

describe('targetEnding', () => {
  it('should go on with a measured file below the threshold', () => {
    const file = { ...measuredTarget({ covered: 4, total: 10 }), path: TARGET };

    expect(targetEnding(file, TARGET)).toBeNull();
  });

  it('should skip with threshold_met a file that meets the threshold', () => {
    const file = {
      ...measuredTarget({ covered: 9, total: 10 }),
      path: TARGET,
      belowThreshold: false,
    };

    expect(endingOf(targetEnding(file, TARGET))).toEqual({
      status: 'skipped',
      reason: 'threshold_met',
      message:
        `The fresh snapshot measures ${TARGET_FILE} at or above the ` +
        'threshold, so there is nothing to improve.',
    });
  });

  it('should fail with verification_error a file the snapshot does not list', () => {
    expect(endingOf(targetEnding(null, TARGET))).toEqual({
      status: 'failed',
      reason: 'verification_error',
      message: `The fresh snapshot does not list ${TARGET_FILE}.`,
    });
  });

  it('should fail with verification_error a file with no code that runs', () => {
    const file = { path: TARGET, state: 'no_executable_code' } as const;

    expect(endingOf(targetEnding(file, TARGET))).toMatchObject({
      reason: 'verification_error',
      message: `The fresh snapshot finds no code that runs in ${TARGET_FILE}.`,
    });
  });

  it('should fail with verification_error and the reason a file is unmeasured', () => {
    const file = {
      path: TARGET,
      state: 'unmeasured',
      reason: 'missing_from_report',
      toolMessage: null,
    } as const;

    expect(endingOf(targetEnding(file, TARGET))).toMatchObject({
      reason: 'verification_error',
      message:
        `The fresh snapshot could not measure ${TARGET_FILE}: ` +
        'missing_from_report.',
    });
  });
});

describe('measureEnding', () => {
  const analyzing = improvementIn('analyzing');

  it('should skip when the policy checks the mutants and none is missed', () => {
    const baseline = {
      ...gateBaselineOf(),
      mutation: { ...mutationOf(), undetected: [] },
    };

    const ending = measureEnding({ outcome: 'measured', baseline }, analyzing);

    expect(endingOf(ending)).toEqual({
      status: 'skipped',
      reason: 'no_undetected_mutants',
      message:
        `The existing tests detect every mutant of ${TARGET_FILE}, so the ` +
        'mutation check could never pass.',
    });
  });

  it('should fail with mutation_unsupported when the tool cannot run', () => {
    const ending = measureEnding(
      {
        outcome: 'unsupported',
        reason: 'mutation_unsupported',
        detail: 'Stryker does not support this runner.',
        outputReference: null,
      },
      analyzing,
    );

    expect(endingOf(ending)).toEqual({
      status: 'failed',
      reason: 'mutation_unsupported',
      message:
        'The gate cannot measure the commit, for the reason ' +
        'mutation_unsupported: Stryker does not support this runner.',
    });
  });

  it('should fail with verification_error for any other reason', () => {
    const ending = measureEnding(
      {
        outcome: 'unsupported',
        reason: 'install_failed',
        detail: 'The install of the packages ended with exit code 1.',
        outputReference: 'artifact-2',
      },
      analyzing,
    );

    expect(endingOf(ending)).toMatchObject({ reason: 'verification_error' });
  });

  it('should fail with budget_exhausted when the gate ran past the deadline', () => {
    const ending = measureEnding({ outcome: 'timed_out' }, analyzing);

    expect(endingOf(ending)).toEqual({
      status: 'failed',
      reason: 'budget_exhausted',
      message:
        'The deadline passed: the 30 minutes of work of the budget are spent.',
    });
  });
});
