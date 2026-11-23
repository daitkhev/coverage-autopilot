import { beforeEach, describe, expect, it } from 'vitest';

import { VerificationProgress } from '#improvement/application/commands/run-improvement/verification-progress';
import { CHECK_NAMES } from '#improvement/domain/value-objects/quality-policy.vo';
import type { JobProgress } from '#ports/job-queue.port';

let reported: JobProgress[];
let progress: VerificationProgress;

beforeEach(() => {
  reported = [];
  progress = new VerificationProgress((each) => {
    reported.push(each);
  });
});

function statusesOf(each: JobProgress | undefined): string[] {
  return each?.steps.map(({ status }) => status) ?? [];
}

describe('VerificationProgress', () => {
  it('should start with the seven checks in their order, all pending', () => {
    progress.begin();

    expect(reported).toEqual([
      { steps: CHECK_NAMES.map((code) => ({ code, status: 'pending' })) },
    ]);
  });

  it('should give the whole list again with the check the gate named', () => {
    progress.heard({ check: 'type_check', status: 'running' });
    progress.heard({ check: 'type_check', status: 'passed' });

    expect(statusesOf(reported[0])).toEqual([
      'pending',
      'running',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(statusesOf(reported[1])[1]).toBe('passed');
  });

  it('should count the runs of a check that repeats until it ends', () => {
    progress.heard({
      check: 'repeated_runs',
      status: 'running',
      done: 1,
      total: 3,
    });
    progress.heard({ check: 'repeated_runs', status: 'error' });

    expect(reported[0]?.steps[4]).toEqual({
      code: 'repeated_runs',
      status: 'running',
      done: 1,
      total: 3,
    });
    expect(reported[1]?.steps[4]).toEqual({
      code: 'repeated_runs',
      status: 'error',
    });
  });

  it('should show no step once the phase is over', () => {
    progress.begin();

    progress.end();

    expect(reported.at(-1)).toEqual({ steps: [] });
  });
});
