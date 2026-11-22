import { describe, expect, it } from 'vitest';

import { generationOf } from '#improvement/application/commands/run-improvement/generation-record';
import {
  CALL_REPORT,
  patchDtoOf,
  resultOf,
  windowSpent,
} from '#tests/support/improvement-generation-results';
import { minutesIn, patchOf } from '#tests/support/improvement-values';

const NOW = minutesIn(10);
const WAIT_MS = 3_600_000;

/** What the improvement records of every call, whatever its outcome. */
const RECORDED_CALL = {
  tokensUsed: CALL_REPORT.tokensUsed,
  outputReference: CALL_REPORT.outputReference,
  refusedToolCalls: CALL_REPORT.refusedToolCalls,
};

describe('generationOf', () => {
  it('should record a generated test with the patch taken from the copy', () => {
    const generation = generationOf(
      { result: resultOf('generated'), patch: patchDtoOf('d') },
      NOW,
      WAIT_MS,
    );

    expect(generation).toEqual({
      ...RECORDED_CALL,
      outcome: 'generated',
      patch: patchOf('d'),
    });
  });

  describe('when the generator said it generated and the copy is as it was', () => {
    it('should record that nothing changed', () => {
      const generation = generationOf(
        { result: resultOf('generated'), patch: null },
        NOW,
        WAIT_MS,
      );

      expect(generation).toEqual({ ...RECORDED_CALL, outcome: 'no_changes' });
    });
  });

  describe('when the five-hour window is spent', () => {
    it('should record the moment the wait for it ends', () => {
      const named = generationOf(
        { result: windowSpent(minutesIn(90)), patch: null },
        NOW,
        WAIT_MS,
      );
      const unnamed = generationOf(
        { result: windowSpent(null), patch: null },
        NOW,
        WAIT_MS,
      );

      expect(named).toEqual({
        ...RECORDED_CALL,
        outcome: 'window_exhausted',
        resumesAt: minutesIn(90),
      });
      expect(unnamed).toMatchObject({ resumesAt: minutesIn(70) });
    });
  });

  describe('when the call left nothing to verify', () => {
    it.each([
      'no_changes',
      'limit_reached',
      'quota_exhausted',
      'credential_exposed',
    ] as const)('should record %s as it is', (outcome) => {
      const generation = generationOf(
        { result: resultOf(outcome), patch: null },
        NOW,
        WAIT_MS,
      );

      expect(generation).toEqual({ ...RECORDED_CALL, outcome });
    });
  });
});
