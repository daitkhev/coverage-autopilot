import { describe, expect, it } from 'vitest';

import {
  generationOf,
  recordOf,
} from '#improvement/application/commands/run-improvement/generation-record';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  CALL_REPORT,
  patchDtoOf,
  resultOf,
  windowSpent,
} from '#tests/support/improvement-generation-results';
import { improvementIn } from '#tests/support/improvement-journeys';
import { minutesIn, patchOf } from '#tests/support/improvement-values';

const NOW = minutesIn(10);
const WAIT_MS = 3_600_000;

const UNCHANGED = { state: 'unchanged' } as const;
const TAMPERED = { state: 'tampered' } as const;

/** Generating, with the first attempt open and nothing generated yet. */
function withOpenAttempt(): Improvement {
  const improvement = improvementIn('generating');
  improvement.openAttempt(minutesIn(4));
  return improvement;
}

/** What the improvement records of every call, whatever its outcome. */
const RECORDED_CALL = {
  tokensUsed: CALL_REPORT.tokensUsed,
  outputReference: CALL_REPORT.outputReference,
  refusedToolCalls: CALL_REPORT.refusedToolCalls,
};

describe('generationOf', () => {
  it('should record a generated test with the patch taken from the copy', () => {
    const generation = generationOf(
      {
        result: resultOf('generated'),
        copy: { state: 'patch', patch: patchDtoOf('d') },
      },
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
        { result: resultOf('generated'), copy: UNCHANGED },
        NOW,
        WAIT_MS,
      );

      expect(generation).toEqual({ ...RECORDED_CALL, outcome: 'no_changes' });
    });
  });

  describe('when the five-hour window is spent', () => {
    it('should record the moment the wait for it ends', () => {
      const named = generationOf(
        { result: windowSpent(minutesIn(90)), copy: UNCHANGED },
        NOW,
        WAIT_MS,
      );
      const unnamed = generationOf(
        { result: windowSpent(null), copy: UNCHANGED },
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
        { result: resultOf(outcome), copy: UNCHANGED },
        NOW,
        WAIT_MS,
      );

      expect(generation).toEqual({ ...RECORDED_CALL, outcome });
    });
  });
});

describe('recordOf', () => {
  it('should record the call as the improvement records a generation', () => {
    const improvement = withOpenAttempt();
    const finished = {
      result: resultOf('generated'),
      copy: { state: 'patch', patch: patchDtoOf() },
    } as const;

    recordOf(finished, NOW, WAIT_MS)(improvement, NOW);

    expect(improvement.status).toBe('verifying');
    expect(improvement.currentAttempt?.patch).toEqual(patchOf());
  });

  describe('when the call wrote a .git into its copy', () => {
    it('should keep what the call spent and fail as a credential exposed', () => {
      const improvement = withOpenAttempt();
      const finished = { result: resultOf('generated'), copy: TAMPERED };

      recordOf(finished, NOW, WAIT_MS)(improvement, NOW);

      const [attempt] = improvement.attempts;
      expect(improvement.status).toBe('failed');
      expect(improvement.failure?.reason).toBe('credential_exposed');
      expect(improvement.failure?.message).toBe(
        'The generator wrote a .git into its working copy, which content of ' +
          'the repository must have steered it to. Nothing it wrote was ' +
          'used, and the credential it ran with is to be taken as exposed.',
      );
      expect(attempt).toMatchObject({
        tokensUsed: RECORDED_CALL.tokensUsed,
        outputReferences: [RECORDED_CALL.outputReference],
        refusedToolCalls: RECORDED_CALL.refusedToolCalls,
        outcome: null,
        patch: null,
        finishedAt: NOW,
      });
    });
  });
});
