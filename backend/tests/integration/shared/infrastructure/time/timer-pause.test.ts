import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { timerPause } from '#infrastructure/time/timer-pause';

const PAUSE_MS = 50;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('timerPause', () => {
  it('should end once the time it was given has passed, and not before', async () => {
    let ended = false;
    const pause = timerPause(PAUSE_MS);
    void pause.finally(() => {
      ended = true;
    });

    await vi.advanceTimersByTimeAsync(PAUSE_MS - 1);
    expect(ended).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(ended).toBe(true);
    await expect(pause).resolves.toBeUndefined();
  });
});
