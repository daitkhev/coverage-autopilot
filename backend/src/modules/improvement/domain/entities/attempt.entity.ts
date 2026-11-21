import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { PatchIntegrityError } from '#improvement/domain/errors/patch-integrity.error';
import type {
  GenerationOutcome,
  GeneratorCall,
} from '#improvement/domain/value-objects/generation.vo';
import type { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import type { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import type { Instant } from '#kernel/time/instant';

/** The outcomes that close an attempt without a patch to verify. */
export type ClosingOutcome = Exclude<
  GenerationOutcome,
  'generated' | 'window_exhausted'
>;

export interface AttemptState {
  /** From 1, in the order the attempts opened. */
  readonly number: number;
  readonly startedAt: Instant;
  /** `null` while the attempt is open. */
  readonly finishedAt: Instant | null;
  /** How the call that ended the generation went, `null` before. */
  readonly outcome: GenerationOutcome | null;
  /** Of every call of this attempt, a call that waited for a window too. */
  readonly tokensUsed: number;
  readonly patch: TestPatch | null;
  readonly report: VerificationReport | null;
  /** The raw output of each call of the generator, in their order. */
  readonly outputReferences: readonly string[];
  readonly refusedToolCalls: readonly string[];
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** What an attempt holds to, each with whether a state holds it. */
const RULES: readonly (readonly [string, (state: AttemptState) => boolean])[] =
  [
    [
      'has a number from 1 and a count of tokens',
      (state) => isCount(state.number - 1) && isCount(state.tokensUsed),
    ],
    [
      'has a patch exactly when it generated a test',
      (state) => (state.patch === null) !== (state.outcome === 'generated'),
    ],
    [
      'has a report of its own patch only',
      (state) =>
        state.report === null || state.report.patchHash === state.patch?.hash,
    ],
    [
      'is closed once the gate decided',
      (state) =>
        state.finishedAt !== null ||
        (state.report?.verdict ?? 'inconclusive') === 'inconclusive',
    ],
  ];

function brokenRuleOf(state: AttemptState): string | undefined {
  return RULES.find(([, holds]) => !holds(state))?.[0];
}

/**
 * One try at generating a test inside an improvement, which it is known
 * by with its number. It is changed only by its improvement, and each
 * change gives a new attempt, so a stored one is never touched.
 */
export class Attempt {
  private readonly state: AttemptState;

  private constructor(state: AttemptState) {
    this.state = Object.freeze({ ...state });
  }

  public static open(number: number, startedAt: Instant): Attempt {
    return Attempt.restore({
      number,
      startedAt,
      finishedAt: null,
      outcome: null,
      tokensUsed: 0,
      patch: null,
      report: null,
      outputReferences: [],
      refusedToolCalls: [],
    });
  }

  public static restore(state: AttemptState): Attempt {
    const broken = brokenRuleOf(state);
    if (broken !== undefined) {
      throw new InvalidImprovementValueError(
        `The attempt ${String(state.number)} breaks a rule: it ${broken}.`,
      );
    }
    return new Attempt(state);
  }

  public get number(): number {
    return this.state.number;
  }

  public get startedAt(): Instant {
    return this.state.startedAt;
  }

  public get finishedAt(): Instant | null {
    return this.state.finishedAt;
  }

  public get isOpen(): boolean {
    return this.state.finishedAt === null;
  }

  public get outcome(): GenerationOutcome | null {
    return this.state.outcome;
  }

  public get tokensUsed(): number {
    return this.state.tokensUsed;
  }

  public get patch(): TestPatch | null {
    return this.state.patch;
  }

  public get report(): VerificationReport | null {
    return this.state.report;
  }

  public get outputReferences(): readonly string[] {
    return this.state.outputReferences;
  }

  public get refusedToolCalls(): readonly string[] {
    return this.state.refusedToolCalls;
  }

  /** What one call of the generator spent and left behind. */
  public withCall(call: GeneratorCall): Attempt {
    this.requireOpen();
    const { outputReference } = call;
    return Attempt.restore({
      ...this.state,
      tokensUsed: this.state.tokensUsed + call.tokensUsed,
      outputReferences: [
        ...this.state.outputReferences,
        ...(outputReference === null ? [] : [outputReference]),
      ],
      refusedToolCalls: [
        ...this.state.refusedToolCalls,
        ...call.refusedToolCalls,
      ],
    });
  }

  /**
   * The patch is written once. The same patch again changes nothing, so a
   * step can run again after a crash, and another one is refused.
   */
  public withPatch(patch: TestPatch): Attempt {
    this.requireOpen();
    const kept = this.state.patch;
    if (kept === null) {
      return Attempt.restore({ ...this.state, patch, outcome: 'generated' });
    }
    if (kept.hash !== patch.hash) {
      throw new PatchIntegrityError(
        `The attempt ${String(this.number)} keeps the patch ${kept.hash}, ` +
          `not ${patch.hash}.`,
      );
    }
    return this;
  }

  /** Closed by a call that left nothing to verify. */
  public closedBy(outcome: ClosingOutcome, at: Instant): Attempt {
    this.requireOpen();
    return Attempt.restore({ ...this.state, outcome, finishedAt: at });
  }

  /**
   * The verdict of the gate on the patch. An inconclusive one says nothing
   * of the patch, so the attempt stays open for the gate to run again.
   */
  public withReport(report: VerificationReport, at: Instant): Attempt {
    this.requireOpen();
    if (report.patchHash !== this.state.patch?.hash) {
      throw new PatchIntegrityError(
        `The report names the patch ${report.patchHash}, and the attempt ` +
          `${String(this.number)} keeps ${this.state.patch?.hash ?? 'no patch'}.`,
      );
    }
    const decided = report.verdict !== 'inconclusive';
    return Attempt.restore({
      ...this.state,
      report,
      finishedAt: decided ? at : null,
    });
  }

  /** Closed because its improvement ended. A closed attempt stays as it is. */
  public endedAt(at: Instant): Attempt {
    return this.isOpen
      ? Attempt.restore({ ...this.state, finishedAt: at })
      : this;
  }

  private requireOpen(): void {
    if (!this.isOpen) {
      throw new InvalidTransitionError(
        `The attempt ${String(this.number)} is closed.`,
      );
    }
  }
}
