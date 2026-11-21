import { describe, expect, it } from 'vitest';

import {
  Attempt,
  type AttemptState,
} from '#improvement/domain/entities/attempt.entity';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { PatchIntegrityError } from '#improvement/domain/errors/patch-integrity.error';
import { GENERATION_OUTCOMES } from '#improvement/domain/value-objects/generation.vo';
import { DomainError } from '#kernel/errors/domain.error';
import {
  CREATED_AT,
  hashOf,
  minutesIn,
  patchOf,
  reportOf,
} from '#tests/support/improvement-values';

const CALL = {
  tokensUsed: 700,
  outputReference: 'outputs/call-1.json',
  refusedToolCalls: ['Bash(curl)'],
} as const;

const OPENED: AttemptState = {
  number: 1,
  startedAt: CREATED_AT,
  finishedAt: null,
  outcome: null,
  tokensUsed: 0,
  patch: null,
  report: null,
  outputReferences: [],
  refusedToolCalls: [],
};

function patched(): Attempt {
  return Attempt.open(1, CREATED_AT).withPatch(patchOf());
}

function closed(): Attempt {
  return Attempt.open(1, CREATED_AT).closedBy('no_changes', minutesIn(1));
}

describe('Attempt', () => {
  it('should know the outcomes of a call of the generator', () => {
    expect(GENERATION_OUTCOMES).toEqual([
      'generated',
      'no_changes',
      'limit_reached',
      'window_exhausted',
      'quota_exhausted',
      'credential_exposed',
    ]);
  });

  describe('open', () => {
    it('should start open, with nothing spent and nothing written', () => {
      const attempt = Attempt.open(2, CREATED_AT);

      expect({
        number: attempt.number,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        isOpen: attempt.isOpen,
        outcome: attempt.outcome,
        tokensUsed: attempt.tokensUsed,
        patch: attempt.patch,
        report: attempt.report,
        outputReferences: attempt.outputReferences,
        refusedToolCalls: attempt.refusedToolCalls,
      }).toEqual({ ...OPENED, number: 2, isOpen: true });
    });
  });

  describe('restore', () => {
    describe('when the state breaks a rule of an attempt', () => {
      it.each<[string, Partial<AttemptState>]>([
        ['has a number from 1 and a count of tokens', { number: 0 }],
        ['has a number from 1 and a count of tokens', { tokensUsed: -1 }],
        ['has a patch exactly when it generated a test', { patch: patchOf() }],
        [
          'has a patch exactly when it generated a test',
          { outcome: 'generated' },
        ],
        [
          'has a report of its own patch only',
          {
            patch: patchOf(),
            outcome: 'generated',
            report: reportOf('rejected', 'b'),
          },
        ],
        [
          'is closed once the gate decided',
          {
            patch: patchOf(),
            outcome: 'generated',
            report: reportOf('rejected'),
          },
        ],
      ])('should throw InvalidImprovementValueError: it %s', (rule, change) => {
        expect(() => Attempt.restore({ ...OPENED, ...change })).toThrow(
          new InvalidImprovementValueError(
            `The attempt ${String(change.number ?? 1)} breaks a rule: it ` +
              `${rule}.`,
          ),
        );
      });
    });
  });

  describe('withCall', () => {
    it('should add what each call spent and left behind', () => {
      const silent = { tokensUsed: 300, outputReference: null };
      const attempt = Attempt.open(1, CREATED_AT)
        .withCall(CALL)
        .withCall({ ...silent, refusedToolCalls: [] });

      expect(attempt.tokensUsed).toBe(1000);
      expect(attempt.outputReferences).toEqual(['outputs/call-1.json']);
      expect(attempt.refusedToolCalls).toEqual(['Bash(curl)']);
    });

    describe('when the attempt is closed', () => {
      it('should throw InvalidTransitionError', () => {
        expect(() => closed().withCall(CALL)).toThrow(
          new InvalidTransitionError('The attempt 1 is closed.'),
        );
      });
    });
  });

  describe('withPatch', () => {
    it('should keep the patch as what the attempt generated', () => {
      const attempt = patched();

      expect(attempt.patch).toEqual(patchOf());
      expect(attempt.outcome).toBe('generated');
      expect(attempt.isOpen).toBe(true);
    });

    it('should change nothing when the same patch comes again', () => {
      const attempt = patched();

      expect(attempt.withPatch(patchOf())).toBe(attempt);
    });

    describe('when another patch comes', () => {
      it('should throw PatchIntegrityError that a rerun does not help', () => {
        const write = (): Attempt => patched().withPatch(patchOf('b'));

        expect(write).toThrow(
          new PatchIntegrityError(
            `The attempt 1 keeps the patch ${hashOf('a')}, not ${hashOf('b')}.`,
          ),
        );
        expect(write).toThrow(
          expect.objectContaining({
            name: 'PatchIntegrityError',
            code: 'patch_integrity',
            retryable: false,
          }),
        );
      });
    });
  });

  describe('closedBy', () => {
    it.each(['no_changes', 'limit_reached'] as const)(
      'should close the attempt with %s and keep what it spent',
      (outcome) => {
        const attempt = Attempt.open(1, CREATED_AT)
          .withCall(CALL)
          .closedBy(outcome, minutesIn(1));

        expect(attempt.isOpen).toBe(false);
        expect(attempt.finishedAt).toEqual(minutesIn(1));
        expect(attempt.outcome).toBe(outcome);
        expect(attempt.tokensUsed).toBe(700);
      },
    );
  });

  describe('withReport', () => {
    it.each(['accepted', 'rejected'] as const)(
      'should close the attempt with the %s report of its patch',
      (verdict) => {
        const attempt = patched().withReport(reportOf(verdict), minutesIn(2));

        expect(attempt.report).toEqual(reportOf(verdict));
        expect(attempt.finishedAt).toEqual(minutesIn(2));
      },
    );

    it('should keep the attempt open for the gate after an inconclusive one', () => {
      const attempt = patched().withReport(
        reportOf('inconclusive'),
        minutesIn(2),
      );

      expect(attempt.report?.verdict).toBe('inconclusive');
      expect(attempt.isOpen).toBe(true);
    });

    describe('when the report names another patch, or there is none', () => {
      it.each([
        [patched(), hashOf('a')],
        [Attempt.open(1, CREATED_AT), 'no patch'],
      ])('should throw PatchIntegrityError', (attempt, kept) => {
        expect(() =>
          attempt.withReport(reportOf('accepted', 'b'), minutesIn(2)),
        ).toThrow(
          new PatchIntegrityError(
            `The report names the patch ${hashOf('b')}, and the attempt 1 ` +
              `keeps ${kept}.`,
          ),
        );
      });
    });
  });

  describe('endedAt', () => {
    it('should close an open attempt at the end of its improvement', () => {
      const attempt = patched().endedAt(minutesIn(3));

      expect(attempt.finishedAt).toEqual(minutesIn(3));
      expect(attempt.patch).toEqual(patchOf());
    });

    it('should leave a closed attempt as it is', () => {
      const attempt = closed();

      expect(attempt.endedAt(minutesIn(3))).toBe(attempt);
    });
  });

  describe('when a change comes to a closed attempt', () => {
    it.each([
      ['withPatch', (attempt: Attempt) => attempt.withPatch(patchOf())],
      [
        'closedBy',
        (attempt: Attempt) => attempt.closedBy('no_changes', CREATED_AT),
      ],
      [
        'withReport',
        (attempt: Attempt) =>
          attempt.withReport(reportOf('accepted'), CREATED_AT),
      ],
    ])('should refuse %s with an error of the domain', (_name, change) => {
      expect(() => change(closed())).toThrow(DomainError);
      expect(() => change(closed())).toThrow('The attempt 1 is closed.');
    });
  });
});
