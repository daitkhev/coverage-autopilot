import { describe, expect, it } from 'vitest';

import { pollUntil, type Waiting } from '#api/polling';

/** A wait whose pauses are recorded and take no time. */
function recordedWaiting(): Waiting & { readonly pauses: number[] } {
  const pauses: number[] = [];
  return {
    wait: { totalMs: 100, intervalMs: 30 },
    pause: async (ms) => {
      pauses.push(ms);
      await Promise.resolve();
    },
    pauses,
  };
}

describe('pollUntil', () => {
  describe('when the first look finds it done', () => {
    it('should say so without a pause', async () => {
      const waiting = recordedWaiting();

      await expect(pollUntil(waiting, () => true)).resolves.toBe(true);
      expect(waiting.pauses).toEqual([]);
    });
  });

  describe('when a later look finds it done', () => {
    it('should pause between two looks, and stop at that one', async () => {
      const waiting = recordedWaiting();
      let looks = 0;

      const done = await pollUntil(waiting, async () => {
        looks += 1;
        return Promise.resolve(looks === 3);
      });

      expect(done).toBe(true);
      expect(waiting.pauses).toEqual([30, 30]);
    });
  });

  describe('when no look finds it done', () => {
    it('should pause the whole wait, look once more after it, and say no', async () => {
      const waiting = recordedWaiting();
      let looks = 0;

      const done = await pollUntil(waiting, () => {
        looks += 1;
        return false;
      });

      expect(done).toBe(false);
      expect(waiting.pauses).toEqual([30, 30, 30, 30]);
      expect(looks).toBe(5);
    });
  });
});
