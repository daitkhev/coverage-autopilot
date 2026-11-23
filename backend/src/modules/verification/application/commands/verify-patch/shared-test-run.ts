import type { RunTestsResult } from '#coverage/application/contracts/coverage-public-api';

type TestRunStart = (signal: AbortSignal) => Promise<RunTestsResult>;

/**
 * The run of every test with the patch, made once at most: the check of
 * the existing tests and the check of coverage read the same run, because
 * a second run would take as long and say the same.
 */
export class SharedTestRun {
  private readonly start: TestRunStart;
  private pending: Promise<RunTestsResult> | null = null;
  private settled: RunTestsResult | null = null;

  public constructor(start: TestRunStart) {
    this.start = start;
  }

  /** `null` while no check has needed the run. */
  public get finished(): RunTestsResult | null {
    return this.settled;
  }

  public async result(signal: AbortSignal): Promise<RunTestsResult> {
    this.pending ??= this.start(signal);
    this.settled = await this.pending;
    return this.settled;
  }
}
