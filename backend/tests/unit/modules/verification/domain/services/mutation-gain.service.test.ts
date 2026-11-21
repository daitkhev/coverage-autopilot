import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import {
  MUTANT_SET,
  mutantAt,
  mutationBaselineDto,
  OLD_TEST,
  TOOL,
} from '#tests/support/verification-mutants';
import { NEW_TEST_FILE } from '#tests/support/verification-requests';
import {
  mutantOf,
  mutationBaselineOf,
} from '#verification/application/dto/verification-dto-mapping';
import {
  type MutationGain,
  mutationGainOf,
  type PatchedMutant,
} from '#verification/domain/services/mutation-gain.service';
import type {
  MutantStatus,
  MutationTool,
} from '#verification/domain/value-objects/mutation-baseline.vo';

const NEW = FilePath.create(NEW_TEST_FILE);
const OLD = FilePath.create(OLD_TEST);

/** A mutant of the run with the patch, and the test files that reach it. */
function patched(
  line: number,
  status: MutantStatus,
  testFiles: readonly FilePath[] = [],
): PatchedMutant {
  return { mutant: mutantOf(mutantAt(line)), status, testFiles };
}

interface GainSpec {
  readonly mutants: readonly PatchedMutant[];
  readonly threshold?: number;
  readonly survivorLimit?: number;
  readonly tool?: MutationTool;
  readonly mutantSetHash?: string;
}

/** The gain over `mutationBaselineDto`, whose U is lines 3, 4 and 5. */
function gainOf(spec: GainSpec): MutationGain {
  return mutationGainOf({
    baseline: mutationBaselineOf(mutationBaselineDto()),
    run: {
      tool: spec.tool ?? TOOL,
      mutantSetHash: spec.mutantSetHash ?? MUTANT_SET,
      mutants: [patched(1, 'killed', [OLD]), ...spec.mutants],
    },
    newTestFiles: [NEW],
    threshold: spec.threshold ?? 50,
    survivorLimit: spec.survivorLimit ?? 10,
  });
}

function survivorsOf(gain: MutationGain): [number, boolean][] {
  return gain.outcome === 'measured'
    ? gain.surviving.map(({ mutant, reached }) => [mutant.startLine, reached])
    : [];
}

describe('mutationGainOf', () => {
  describe('when the new tests kill every mutant they reach', () => {
    it('should pass with what they add', () => {
      const gain = gainOf({
        mutants: [3, 4, 5].map((line) => patched(line, 'killed', [NEW])),
      });

      expect(gain).toEqual({
        outcome: 'measured',
        passed: true,
        counts: { undetectedBefore: 3, killed: 3, reached: 3, timedOut: 0 },
        surviving: [],
      });
    });
  });

  describe('when the kill rate is below the threshold', () => {
    it('should fail and name the survivors the new tests reach first', () => {
      const gain = gainOf({
        mutants: [
          patched(3, 'survived'),
          patched(4, 'killed', [NEW]),
          patched(5, 'survived', [NEW]),
          patched(6, 'survived', [NEW]),
        ],
        threshold: 51,
      });

      expect(gain.outcome === 'measured' && gain.passed).toBe(false);
      expect(gain.outcome === 'measured' && gain.counts.reached).toBe(2);
      expect(survivorsOf(gain)).toEqual([
        [5, true],
        [3, false],
      ]);
    });
  });

  describe('when the kill rate meets the threshold exactly', () => {
    it('should pass', () => {
      const gain = gainOf({
        mutants: [
          patched(3, 'killed', [NEW]),
          patched(4, 'no_coverage', [NEW]),
          patched(5, 'survived'),
        ],
      });

      expect(gain.outcome === 'measured' && gain.passed).toBe(true);
    });
  });

  describe('when the new tests kill nothing', () => {
    it('should fail even at a threshold of zero', () => {
      const gain = gainOf({
        mutants: [3, 4, 5].map((line) => patched(line, 'survived', [NEW])),
        threshold: 0,
      });

      expect(gain.outcome === 'measured' && gain.passed).toBe(false);
    });
  });

  describe('when a mutant timed out', () => {
    it('should count it neither as killed nor as reached', () => {
      const gain = gainOf({
        mutants: [
          patched(3, 'killed', [NEW]),
          patched(4, 'timeout', [NEW]),
          patched(5, 'error', [NEW]),
        ],
        threshold: 50,
      });

      expect(gain.outcome === 'measured' && gain.counts).toEqual({
        undetectedBefore: 3,
        killed: 1,
        reached: 2,
        timedOut: 1,
      });
      expect(survivorsOf(gain)).toEqual([]);
    });
  });

  describe('when more mutants survive than the limit', () => {
    it('should name only as many as the limit', () => {
      const gain = gainOf({
        mutants: [3, 4, 5].map((line) => patched(line, 'survived')),
        survivorLimit: 2,
      });

      expect(survivorsOf(gain)).toEqual([
        [3, false],
        [4, false],
      ]);
    });
  });

  describe('when the run with the patch is not comparable', () => {
    it('should say so for another tool, another set or a lost mutant', () => {
      const killed = [3, 4, 5].map((line) => patched(line, 'killed', [NEW]));

      expect(
        gainOf({ mutants: killed, tool: { ...TOOL, version: '11.0.0' } }),
      ).toMatchObject({ outcome: 'incomparable', reason: /stryker 11\.0\.0/u });
      expect(gainOf({ mutants: killed, mutantSetHash: 'other' })).toMatchObject(
        { outcome: 'incomparable', reason: /another set of mutants/u },
      );
      expect(gainOf({ mutants: killed.slice(1) })).toMatchObject({
        outcome: 'incomparable',
        reason: /lacks a mutant/u,
      });
    });
  });
});
