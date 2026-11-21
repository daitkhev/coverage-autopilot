import { describe, expect, it } from 'vitest';

import { testRunOf } from '#tests/support/verification-coverage';
import { SharedTestRun } from '#verification/application/commands/verify-patch/shared-test-run';

const RUNNING = new AbortController().signal;

describe('SharedTestRun', () => {
  it('should run once for every check that reads it', async () => {
    let started = 0;
    const run = new SharedTestRun(async () => {
      started += 1;
      return Promise.resolve(testRunOf('failed'));
    });

    const first = await run.result(RUNNING);
    const second = await run.result(RUNNING);

    expect(started).toBe(1);
    expect(second).toBe(first);
  });

  it('should be unfinished until a check needs it', async () => {
    const run = new SharedTestRun(async () =>
      Promise.resolve(testRunOf('passed')),
    );

    expect(run.finished).toBeNull();
    await run.result(RUNNING);
    expect(run.finished).toEqual(testRunOf('passed'));
  });
});
