import type {
  CheckProgress,
  ProgressObserver,
} from '#verification/application/contracts/verification-public-api';
import type {
  CheckName,
  CheckResult,
  CheckStatus,
} from '#verification/domain/value-objects/check-result.vo';

interface Runs {
  readonly done: number;
  readonly total: number;
}

/**
 * The results of the checks of one patch, in the order they ended, and the
 * listener of the call, told when a check starts, repeats and ends.
 */
export class CheckBook {
  private readonly observer: ProgressObserver<CheckProgress>;
  private readonly results: CheckResult[] = [];

  public constructor(observer: ProgressObserver<CheckProgress>) {
    this.observer = observer;
  }

  public get checks(): readonly CheckResult[] {
    return [...this.results];
  }

  public begin(check: CheckName): void {
    this.observer({ check, status: 'running' });
  }

  public repeat(check: CheckName, runs: Runs): void {
    this.observer({ check, status: 'running', ...runs });
  }

  public record(result: CheckResult): void {
    this.results.push(result);
    this.observer({ check: result.name, status: result.status });
  }

  /** `null` while the check has not ended. */
  public statusOf(check: CheckName): CheckStatus | null {
    return this.results.find(({ name }) => name === check)?.status ?? null;
  }
}
