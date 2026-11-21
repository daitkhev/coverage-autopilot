import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import type { SurvivingMutant } from '#improvement/domain/value-objects/mutant.vo';
import type { CheckName } from '#improvement/domain/value-objects/quality-policy.vo';
import { SHA256_HEX } from '#improvement/domain/value-objects/test-patch.vo';
import { ValueObject } from '#kernel/primitives/value-object';

export const VERDICTS = ['accepted', 'rejected', 'inconclusive'] as const;

export type Verdict = (typeof VERDICTS)[number];

/**
 * `failed`: the patch is at fault. `skipped`: the policy does not require
 * the check. `not_applicable`: the check has nothing to examine. `error`:
 * the check could not finish, so it says nothing about the patch.
 */
export const CHECK_STATUSES = [
  'passed',
  'failed',
  'skipped',
  'not_applicable',
  'error',
] as const;

type CheckStatus = (typeof CHECK_STATUSES)[number];

export interface CheckResult {
  readonly name: CheckName;
  readonly status: CheckStatus;
  /** Matters for `error` alone: whether running the check again can help. */
  readonly retryable: boolean;
  readonly durationMs: number | null;
  /** How many runs the check made, or `null` when it does not repeat. */
  readonly runs: number | null;
  readonly message: string | null;
  /** The raw output of the tool in the store of raw output. */
  readonly outputReference: string | null;
}

interface CoverageCount {
  readonly covered: number;
  readonly total: number;
}

export type TargetCoverage = Readonly<
  Record<'statements' | 'branches' | 'functions' | 'lines', CoverageCount>
>;

/** What the new tests add, not the score a mutation tool prints. */
export interface MutantCounts {
  readonly undetectedBefore: number;
  /** Undetected before, killed with the patch. */
  readonly killed: number;
  /** Undetected before, run by a new test, and not timed out. */
  readonly reached: number;
  readonly timedOut: number;
}

export interface VerificationReportProps {
  /** The hash of the patch that was verified. */
  readonly patchHash: string;
  readonly verdict: Verdict;
  /** A sentence for each required check that did not pass. */
  readonly reasons: readonly string[];
  readonly checks: readonly CheckResult[];
  /** `null` when the coverage check did not get that far. */
  readonly coverageBefore: TargetCoverage | null;
  readonly coverageAfter: TargetCoverage | null;
  readonly mutants: MutantCounts | null;
  readonly survivingMutants: readonly SurvivingMutant[];
}

/** A check that holds the patch back, so no report with it is accepted. */
const AGAINST: readonly CheckStatus[] = ['failed', 'error'];

function problemOf(props: VerificationReportProps): string {
  const names = new Set(props.checks.map((check) => check.name));
  if (!SHA256_HEX.test(props.patchHash) || !VERDICTS.includes(props.verdict)) {
    return 'does not name a patch by its hash or has no known verdict';
  }
  if (names.size !== props.checks.length) {
    return 'has a check twice';
  }
  const against = props.checks.some((check) => AGAINST.includes(check.status));
  return props.verdict === 'accepted' && against
    ? 'accepts a patch that a check failed or could not judge'
    : '';
}

/**
 * The results of every check of the gate for one patch, with the verdict.
 * It belongs to the attempt that made the patch and is kept as it came.
 */
export class VerificationReport extends ValueObject<VerificationReportProps> {
  private constructor(props: VerificationReportProps) {
    super(props);
  }

  public static create(props: VerificationReportProps): VerificationReport {
    const problem = problemOf(props);
    if (problem !== '') {
      throw new InvalidImprovementValueError(
        `The verification report ${problem}.`,
      );
    }
    return new VerificationReport(props);
  }

  public get patchHash(): string {
    return this.props.patchHash;
  }

  public get verdict(): Verdict {
    return this.props.verdict;
  }

  public get reasons(): readonly string[] {
    return this.props.reasons;
  }

  public get checks(): readonly CheckResult[] {
    return this.props.checks;
  }

  public get coverageBefore(): TargetCoverage | null {
    return this.props.coverageBefore;
  }

  public get coverageAfter(): TargetCoverage | null {
    return this.props.coverageAfter;
  }

  public get mutants(): MutantCounts | null {
    return this.props.mutants;
  }

  public get survivingMutants(): readonly SurvivingMutant[] {
    return this.props.survivingMutants;
  }
}
