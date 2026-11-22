import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { SystemClock } from '#infrastructure/time/system-clock.adapter';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { Instant } from '#kernel/time/instant';
import { FixedClock } from '#tests/support/fixed-clock';

/** The clock and the file system may differ by this much, and no more. */
const TOLERANCE_MS = 5_000;

const MINUTE = 60_000;

/** The time the file system gives a file it has just written. */
function timeOfNewFile(): number {
  const folder = mkdtempSync(join(tmpdir(), 'clock-'));
  try {
    const file = join(folder, 'now');
    writeFileSync(file, '');
    return statSync(file).mtimeMs;
  } finally {
    rmSync(folder, { recursive: true });
  }
}

describe('SystemClock', () => {
  describe('now', () => {
    it('should tell the time the operating system tells', () => {
      const now = new SystemClock().now().epochMilliseconds;

      expect(Math.abs(now - timeOfNewFile())).toBeLessThan(TOLERANCE_MS);
    });

    it('should give a moment its one text can hold', () => {
      const now = new SystemClock().now();

      expect(Instant.parse(now.toString()).equals(now)).toBe(true);
    });
  });

  describe('when it is injected by its token', () => {
    it('should be the clock of the service', async () => {
      const module = await Test.createTestingModule({
        providers: [{ provide: CLOCK, useClass: SystemClock }],
      }).compile();

      expect(module.get<Clock>(CLOCK)).toBeInstanceOf(SystemClock);
    });
  });
});

describe('FixedClock', () => {
  it('should stand still until a test moves it', () => {
    const clock = new FixedClock('2026-11-21T10:00:00.000Z');

    const before = clock.now().toString();
    clock.advance(MINUTE);

    expect(before).toBe('2026-11-21T10:00:00.000Z');
    expect(clock.now().toString()).toBe('2026-11-21T10:01:00.000Z');
  });
});
