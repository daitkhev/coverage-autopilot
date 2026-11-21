import { describe, expect, it } from 'vitest';

import { BaselineMismatchError } from '#improvement/domain/errors/baseline-mismatch.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import {
  type BaselineSnapshot,
  generationStarted,
  skipped,
  withBaselineSnapshot,
  withVerificationBaseline,
  workStarted,
} from '#improvement/domain/services/analysis.service';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { improvementIn, skipOf } from '#tests/support/improvement-journeys';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  baselineOf,
  LIMITS,
  minutesIn,
} from '#tests/support/improvement-values';

const AT = minutesIn(10);
const OTHER_COMMIT = 'c'.repeat(BASE_COMMIT.length);

function snapshotOf(
  id = BASELINE_SNAPSHOT_ID,
  commit = BASE_COMMIT,
): BaselineSnapshot {
  return { id: SnapshotId.create(id), commit: CommitSha.create(commit) };
}

const ANALYZING = improvementIn('analyzing').state;

describe('workStarted', () => {
  it('should start the analysis and turn the limit of minutes into a deadline', () => {
    const state = workStarted(improvementIn('created').state, AT);

    expect(state.status).toBe('analyzing');
    expect(state.phaseStartedAt).toEqual(AT);
    expect(state.deadlineAt).toEqual(minutesIn(10 + LIMITS.minutes));
  });

  describe('when the work has started already', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() => workStarted(ANALYZING, AT)).toThrow(
        new InvalidTransitionError(
          'An improvement that is analyzing cannot become analyzing.',
        ),
      );
    });
  });
});

describe('withBaselineSnapshot', () => {
  it('should keep the fresh snapshot without a change of status', () => {
    const state = withBaselineSnapshot(ANALYZING, snapshotOf(), AT);

    expect(state.baselineSnapshotId?.value).toBe(BASELINE_SNAPSHOT_ID);
    expect([state.status, state.updatedAt]).toEqual(['analyzing', AT]);
  });

  it('should replace the snapshot a run before a crash recorded', () => {
    const again = '00000000-0000-4000-8000-000000000105';
    const first = withBaselineSnapshot(ANALYZING, snapshotOf(), AT);

    expect(
      withBaselineSnapshot(first, snapshotOf(again), AT).baselineSnapshotId
        ?.value,
    ).toBe(again);
  });

  describe('when the snapshot measured another commit', () => {
    it('should throw BaselineMismatchError that a rerun does not help', () => {
      const record = (): unknown =>
        withBaselineSnapshot(
          ANALYZING,
          snapshotOf(BASELINE_SNAPSHOT_ID, OTHER_COMMIT),
          AT,
        );

      expect(record).toThrow(
        new BaselineMismatchError(
          `The improvement is made on ${BASE_COMMIT}, and the baseline ` +
            `measured ${OTHER_COMMIT}.`,
        ),
      );
      expect(record).toThrow(
        expect.objectContaining({
          code: 'baseline_mismatch',
          retryable: false,
        }),
      );
    });
  });

  describe('when the analysis is over', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        withBaselineSnapshot(
          improvementIn('generating').state,
          snapshotOf(),
          AT,
        ),
      ).toThrow(InvalidTransitionError);
    });
  });
});

describe('withVerificationBaseline', () => {
  it('should keep the baseline of the gate without a change of status', () => {
    const state = withVerificationBaseline(ANALYZING, baselineOf(), AT);

    expect(state.verificationBaseline).toEqual(baselineOf());
    expect([state.status, state.updatedAt]).toEqual(['analyzing', AT]);
  });

  describe('when the baseline measured another commit or another file', () => {
    it.each([
      [
        { commit: CommitSha.create(OTHER_COMMIT) },
        `made on ${BASE_COMMIT}, and the baseline measured ${OTHER_COMMIT}.`,
      ],
      [
        { targetFile: FilePath.create('src/tax.ts') },
        'for src/price.ts, and the baseline measured src/tax.ts.',
      ],
    ])('should throw BaselineMismatchError for %o', (change, said) => {
      expect(() =>
        withVerificationBaseline(ANALYZING, baselineOf(change), AT),
      ).toThrow(new BaselineMismatchError(`The improvement is ${said}`));
    });
  });

  describe('when the analysis is over', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        withVerificationBaseline(
          improvementIn('skipped').state,
          baselineOf(),
          AT,
        ),
      ).toThrow(InvalidTransitionError);
    });
  });
});

describe('generationStarted', () => {
  it('should start generating once both baselines are recorded', () => {
    const measured = withVerificationBaseline(
      withBaselineSnapshot(ANALYZING, snapshotOf(), AT),
      baselineOf(),
      AT,
    );

    expect(generationStarted(measured, AT).status).toBe('generating');
  });

  describe('when a baseline is missing', () => {
    it.each([
      withBaselineSnapshot(ANALYZING, snapshotOf(), AT),
      withVerificationBaseline(ANALYZING, baselineOf(), AT),
    ])('should throw InvalidTransitionError', (state) => {
      expect(() => generationStarted(state, AT)).toThrow(
        new InvalidTransitionError(
          'Generation starts once the baseline snapshot and the baseline of ' +
            'the gate are recorded.',
        ),
      );
    });
  });

  describe('when the improvement does not analyze', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        generationStarted(improvementIn('created').state, AT),
      ).toThrow(InvalidTransitionError);
    });
  });
});

describe('skipped', () => {
  it('should end the analysis with the reason for doing nothing', () => {
    const state = skipped(ANALYZING, skipOf(), AT);

    expect(state.status).toBe('skipped');
    expect(state.skip).toEqual(skipOf());
  });

  describe('when generation has started', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        skipped(improvementIn('generating').state, skipOf(), AT),
      ).toThrow(
        new InvalidTransitionError(
          'An improvement that is generating cannot become skipped.',
        ),
      );
    });
  });
});
