import { describe, expect, it, vi } from 'vitest';

import { pause } from '#api/pause';

/*
 * The fake timers of the test runner leave the timers of
 * `node:timers/promises` alone, so the timer is a stand-in that a test
 * fires.
 */
const timer = vi.hoisted(() => ({
  wait: vi.fn<(ms: number) => Promise<void>>(),
}));

vi.mock('node:timers/promises', () => ({ setTimeout: timer.wait }));

describe('pause', () => {
  it('should wait for a timer of that length, and end when it fires', async () => {
    const fired = Promise.withResolvers<undefined>();
    timer.wait.mockReturnValue(fired.promise);
    let over = false;

    const waiting = (async () => {
      await pause(1000);
      over = true;
    })();
    await Promise.resolve();

    expect(timer.wait).toHaveBeenCalledWith(1000);
    expect(over).toBe(false);
    fired.resolve(undefined);
    await waiting;
    expect(over).toBe(true);
  });
});
