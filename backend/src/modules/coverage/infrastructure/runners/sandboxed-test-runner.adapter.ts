import { rmSync } from 'node:fs';
import { join } from 'node:path';

import type { CoverageSettings } from '#coverage/application/coverage-settings';
import type {
  TestRunner,
  TestRunOutput,
  TestRunRequest,
} from '#coverage/application/ports/test-runner.port';
import type { TestRunnerName } from '#coverage/domain/value-objects/detected-project.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import type { Sandbox } from '#ports/sandbox.port';

/**
 * Where a runner writes its report, relative to the working copy. Under
 * `node_modules`, which a repository keeps out of git, so a patch taken
 * from the copy later never carries the report.
 */
export const REPORT_FOLDER = 'node_modules/.cache/coverage-autopilot/coverage';

const REPORT_FILE = 'coverage-final.json';

/** Characters a glob of Jest or Vitest reads as a pattern. */
const GLOB_CHARACTERS = /[*?[\]{}()!+@]/gu;

/**
 * A path as a glob that matches that file alone, so a file named like a
 * pattern, such as `[id].ts`, is measured and nothing else with it.
 */
export function exactGlob(path: FilePath): string {
  return path.value.replace(GLOB_CHARACTERS, '\\$&');
}

/** How one runner is started: its program and its arguments. */
export interface RunnerCommand {
  readonly testRunner: TestRunnerName;
  commandFor(request: TestRunRequest): string[];
}

/**
 * Runs the tests of one runner in the sandbox: no network, the variables
 * of the settings and nothing else, and the time limit of a test run. The
 * report of an earlier run in the same copy is removed first, so a run
 * that writes none is never read as one that did.
 */
export class SandboxedTestRunner implements TestRunner {
  public readonly testRunner: TestRunnerName;
  private readonly command: RunnerCommand;
  private readonly sandbox: Sandbox;
  private readonly settings: CoverageSettings;

  public constructor(
    command: RunnerCommand,
    sandbox: Sandbox,
    settings: CoverageSettings,
  ) {
    this.testRunner = command.testRunner;
    this.command = command;
    this.sandbox = sandbox;
    this.settings = settings;
  }

  public async run(
    request: TestRunRequest,
    signal: AbortSignal,
  ): Promise<TestRunOutput> {
    const folder = join(request.workingCopyPath, REPORT_FOLDER);
    rmSync(folder, { recursive: true, force: true });
    const result = await this.sandbox.run(
      {
        workingCopyPath: request.workingCopyPath,
        command: this.command.commandFor(request),
        environment: this.settings.commandEnvironment,
        network: 'none',
        timeoutMs: this.settings.testRunTimeoutMs,
      },
      signal,
    );
    const measured = request.coverageFiles !== null;
    return { result, reportPath: measured ? join(folder, REPORT_FILE) : null };
  }
}
