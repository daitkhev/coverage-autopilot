import { describe, expect, it } from 'vitest';

import type { ProgressStep } from '@coverage-autopilot/api-contracts/progress';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import {
  detailFacts,
  rowFacts,
  runnerWords,
  stepAt,
} from '#screens/repositories/repository-words';
import { SAMPLE_NOW } from '#tests/support/fake-service-api';
import {
  NEVER_SCANNED_REPOSITORY,
  SCAN_BY_STATUS,
  SCANNED_REPOSITORY,
  SCANNING_REPOSITORY,
  TRUSTED_REPOSITORY,
} from '#tests/support/sample-repositories';

function stepsOf(...statuses: ProgressStep['status'][]): ProgressStep[] {
  return statuses.map((status, index) => ({
    code: `step_${String(index)}`,
    status,
  }));
}

function scanAt(steps: readonly ProgressStep[]): Scan {
  return {
    ...SCAN_BY_STATUS.running,
    progress: { steps: [...steps], updatedAt: SAMPLE_NOW },
  };
}

function wordsOf(scan: Scan): string {
  const [, step] = rowFacts(
    { repository: SCANNING_REPOSITORY, scan },
    { state: 'scanning', now: SAMPLE_NOW },
  );
  return step?.text ?? '';
}

describe('stepAt', () => {
  it.each([
    { steps: stepsOf('passed', 'running', 'pending'), at: 1 },
    { steps: stepsOf('passed', 'pending', 'pending'), at: 1 },
    { steps: stepsOf('passed', 'passed', 'passed'), at: 2 },
  ])('should find step $at', ({ steps, at }) => {
    expect(stepAt(steps)).toBe(at);
  });
});

describe('rowFacts', () => {
  it('should say a step the client does not know by its code', () => {
    expect(wordsOf(scanAt(stepsOf('passed', 'running')))).toBe('step_1');
  });

  it('should say a scan runs before it wrote a step', () => {
    expect(wordsOf(scanAt([]))).toBe('scanning');
  });

  it('should count the time from the queue when the scan has not started', () => {
    const scan = { ...scanAt(stepsOf('pending')), startedAt: null };
    const [, , time] = rowFacts(
      { repository: SCANNING_REPOSITORY, scan },
      { state: 'scanning', now: SAMPLE_NOW },
    );

    expect(time?.text).toBe('42s');
  });
});

describe('detailFacts', () => {
  const now = SAMPLE_NOW;
  const trusted = { text: 'trusted install', role: 'warning' };

  it.each([
    ['scanned', { repository: TRUSTED_REPOSITORY, scan: undefined }],
    [
      'unscanned',
      {
        repository: {
          ...NEVER_SCANNED_REPOSITORY,
          install: TRUSTED_REPOSITORY.install,
        },
        scan: undefined,
      },
    ],
    [
      'scanning',
      {
        repository: {
          ...SCANNING_REPOSITORY,
          install: TRUSTED_REPOSITORY.install,
        },
        scan: SCAN_BY_STATUS.running,
      },
    ],
  ] as const)('should mark a trusted install last when %s', (state, row) => {
    expect(detailFacts(row, { state, now }).at(-1)).toEqual(trusted);
  });

  it('should leave a sandboxed install unmarked', () => {
    const row = { repository: SCANNED_REPOSITORY, scan: undefined };

    expect(detailFacts(row, { state: 'scanned', now })).not.toContainEqual(
      trusted,
    );
  });
});

describe('runnerWords', () => {
  it('should name the runner with its major version', () => {
    expect(
      runnerWords({ testRunner: 'jest', testRunnerVersion: '29.7.0' }),
    ).toBe('Jest 29');
    expect(
      runnerWords({ testRunner: 'vitest', testRunnerVersion: '4.1.12' }),
    ).toBe('Vitest 4');
  });

  it('should keep a version that has no dot as it is', () => {
    expect(runnerWords({ testRunner: 'jest', testRunnerVersion: '30' })).toBe(
      'Jest 30',
    );
  });
});
