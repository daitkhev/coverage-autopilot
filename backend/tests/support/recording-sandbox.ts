import type { CoverageSettings } from '#coverage/application/coverage-settings';
import type {
  Sandbox,
  SandboxCommandRequest,
  SandboxCommandResult,
} from '#ports/sandbox.port';

/** The settings of the coverage module in a test. */
export const COVERAGE_TEST_SETTINGS: CoverageSettings = {
  installTimeoutMs: 600_000,
  testRunTimeoutMs: 300_000,
  commandEnvironment: { PATH: '/usr/local/bin:/usr/bin:/bin', CI: 'true' },
};

/** A command that ran and passed, as the sandbox answers it. */
export const PASSED: SandboxCommandResult = {
  outcome: 'exited',
  exitCode: 0,
  output: 'Tests: 1 passed, 1 total\n',
  outputTruncated: false,
  durationMs: 1200,
};

/** What a stand-in does when a command runs, before it answers. */
type CommandEffect = (request: SandboxCommandRequest) => void;

/**
 * A sandbox that starts nothing. It keeps every request, answers with the
 * results a test queued, or with `PASSED`, and runs the effect of a test
 * first, such as writing a report.
 */
export class RecordingSandbox implements Sandbox {
  public readonly requests: SandboxCommandRequest[] = [];
  private readonly results: SandboxCommandResult[] = [];
  private effect: CommandEffect = () => undefined;

  public answer(...results: SandboxCommandResult[]): this {
    this.results.push(...results);
    return this;
  }

  public onRun(effect: CommandEffect): this {
    this.effect = effect;
    return this;
  }

  public async run(
    request: SandboxCommandRequest,
    signal: AbortSignal,
  ): Promise<SandboxCommandResult> {
    signal.throwIfAborted();
    this.requests.push(request);
    this.effect(request);
    return Promise.resolve(this.results.shift() ?? PASSED);
  }
}
