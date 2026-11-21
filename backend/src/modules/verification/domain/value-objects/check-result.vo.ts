import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidCheckResultError } from '#verification/domain/errors/invalid-check-result.error';

/** The seven checks of the gate. */
export type CheckName =
  | 'test_files_only'
  | 'type_check'
  | 'new_tests_pass'
  | 'existing_tests_pass'
  | 'repeated_runs'
  | 'coverage_increase'
  | 'mutation_gain';

/**
 * `failed`: the patch is at fault. `skipped`: the policy does not require
 * the check. `not_applicable`: the check has nothing to examine. `error`:
 * the check could not finish, so it says nothing about the patch.
 */
export type CheckStatus =
  'passed' | 'failed' | 'skipped' | 'not_applicable' | 'error';

interface CheckResultProps {
  readonly name: CheckName;
  readonly status: CheckStatus;
  readonly retryable: boolean;
  readonly durationMs: number | null;
  readonly runs: number | null;
  readonly message: string | null;
  readonly outputReference: string | null;
}

/** What a check that ran leaves behind besides its status. */
interface Evidence {
  /** How many runs a check that repeats made. */
  readonly runs?: number | null;
  readonly outputReference?: string | null;
}

/** Why a check could not finish, and whether running it again can help. */
interface Fault extends Evidence {
  readonly message: string;
  readonly retryable: boolean;
}

function isCount(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 0);
}

function problemOf(props: CheckResultProps): string {
  const { status, message, runs, durationMs } = props;
  if (status !== 'passed' && status !== 'skipped' && message === '') {
    return `a ${status} check gives no reason`;
  }
  return isCount(runs) && isCount(durationMs)
    ? ''
    : 'its runs or its time are not whole numbers from 0';
}

/**
 * One check of a patch: its status and its evidence. A check that did not
 * pass says why, so a rejection always has words for the generator, and
 * only a check that could not finish can be worth running again.
 */
export class CheckResult extends ValueObject<CheckResultProps> {
  private constructor(props: CheckResultProps) {
    super(props);
  }

  public static passed(name: CheckName, evidence: Evidence = {}): CheckResult {
    return CheckResult.of({ name, status: 'passed', message: null }, evidence);
  }

  public static failed(
    name: CheckName,
    message: string,
    evidence: Evidence = {},
  ): CheckResult {
    return CheckResult.of({ name, status: 'failed', message }, evidence);
  }

  public static error(name: CheckName, fault: Fault): CheckResult {
    const { message, retryable } = fault;
    return CheckResult.of({ name, status: 'error', message, retryable }, fault);
  }

  public static notApplicable(name: CheckName, message: string): CheckResult {
    return CheckResult.of({ name, status: 'not_applicable', message }, {});
  }

  public static skipped(name: CheckName): CheckResult {
    return CheckResult.of({ name, status: 'skipped', message: null }, {});
  }

  private static of(
    verdict: Pick<CheckResultProps, 'name' | 'status' | 'message'> & {
      readonly retryable?: boolean;
    },
    evidence: Evidence,
  ): CheckResult {
    return CheckResult.checked({
      ...verdict,
      retryable: verdict.retryable ?? false,
      durationMs: null,
      runs: evidence.runs ?? null,
      outputReference: evidence.outputReference ?? null,
    });
  }

  private static checked(props: CheckResultProps): CheckResult {
    const problem = problemOf(props);
    if (problem !== '') {
      throw new InvalidCheckResultError(
        `The result of the check ${props.name} cannot be: ${problem}.`,
      );
    }
    return new CheckResult(props);
  }

  public get name(): CheckName {
    return this.props.name;
  }

  public get status(): CheckStatus {
    return this.props.status;
  }

  /** Matters for `error` alone: whether running the check again can help. */
  public get retryable(): boolean {
    return this.props.retryable;
  }

  /** `null` when the check did not run. */
  public get durationMs(): number | null {
    return this.props.durationMs;
  }

  /** How many runs the check made, or `null` when it does not repeat. */
  public get runs(): number | null {
    return this.props.runs;
  }

  public get message(): string | null {
    return this.props.message;
  }

  /** The raw output of the tool in the artifact store. */
  public get outputReference(): string | null {
    return this.props.outputReference;
  }

  /** The same result with the time the check took. */
  public withDuration(durationMs: number): CheckResult {
    return CheckResult.checked({ ...this.props, durationMs });
  }
}
