import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/**
 * Where a runner writes the JSON report of its tests, relative to the
 * working copy. Right in `node_modules`, which is there before any run:
 * Jest does not make the folder of the file, and stops when it is missing.
 */
export const RESULTS_FILE =
  'node_modules/.coverage-autopilot-test-results.json';

/**
 * The JSON report of the tests of a run, as an absolute path: Vitest
 * reads a relative one from the root of its configuration, which a
 * repository may move.
 */
export function resultsPathOf(request: TestRunRequest): string {
  return join(request.workingCopyPath, RESULTS_FILE);
}

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
  /** What the command reads from the working copy, by its path in it. */
  readonly files: Readonly<Record<string, string>>;
  commandFor(request: TestRunRequest): string[];
}

/**
 * Writes a file of the service into the copy. What is at its path goes
 * first and the file is made new, so a link a package left there is never
 * written through.
 */
function writeInto(copy: string, file: string, content: string): void {
  const path = join(copy, file);
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { recursive: true, force: true });
  writeFileSync(path, content, { flag: 'wx' });
}

/**
 * Runs the tests of one runner in the sandbox: no network, the variables
 * of the settings and nothing else, and the time limit of a test run. The
 * reports of an earlier run in the same copy are removed first, so a run
 * that writes none is never read as one that did, and the files of the
 * command are written.
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
    const resultsPath = resultsPathOf(request);
    rmSync(folder, { recursive: true, force: true });
    rmSync(resultsPath, { recursive: true, force: true });
    for (const [file, content] of Object.entries(this.command.files)) {
      writeInto(request.workingCopyPath, file, content);
    }
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
    return {
      result,
      reportPath: measured ? join(folder, REPORT_FILE) : null,
      resultsPath,
    };
  }
}
