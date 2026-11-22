import { describe, expect, it } from 'vitest';

import type { ProgressStep } from '@coverage-autopilot/api-contracts/progress';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import { rowFacts, stepAt } from '#screens/repositories/repository-words';
import { SAMPLE_NOW } from '#tests/support/fake-service-api';
import {
  SCAN_BY_STATUS,
  SCANNING_REPOSITORY,
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
