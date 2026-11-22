import { Inject, Injectable } from '@nestjs/common';

import { ARTIFACT_STORE, type ArtifactStore } from '#ports/artifact-store.port';
import {
  SANDBOX,
  type Sandbox,
  type SandboxCommandResult,
} from '#ports/sandbox.port';
import type {
  MutationRunner,
  MutationRunRequest,
  MutationRunResult,
  MutationToolRequest,
  MutationToolResult,
  PatchedMutationRunRequest,
} from '#verification/application/ports/mutation-runner.port';
import { UnreadableMutationReportError } from '#verification/infrastructure/errors/unreadable-mutation-report.error';
import { prepareFolder } from '#verification/infrastructure/mutation/mutation-folder';
import {
  MUTATION_SETTINGS,
  type MutationSettings,
} from '#verification/infrastructure/mutation/mutation-settings';
import { cacheTextOf } from '#verification/infrastructure/mutation/stryker-cache';
import {
  CACHE_FILE,
  CONFIG_FILE,
  installCommandOf,
  listingConfigurationOf,
  REPORT_FILE,
  RUN_COMMAND,
  runVariablesOf,
  strykerConfigurationOf,
} from '#verification/infrastructure/mutation/stryker-configuration';
import {
  listedMutantsOf,
  mutantsOf,
} from '#verification/infrastructure/mutation/stryker-mutants';
import type { StrykerReport } from '#verification/infrastructure/mutation/stryker-report.schema';
import {
  parseStrykerReport,
  readStrykerReport,
} from '#verification/infrastructure/mutation/stryker-report-reading';
import {
  capped,
  detailOf,
  type Scrub,
  scrubberOf,
} from '#verification/infrastructure/mutation/tool-text';

const TOOL_NAME = 'StrykerJS';

/** How npm starts the lines that say why an install failed. */
const NPM_ERROR = /^npm (?:error|ERR!)/u;

/** The level StrykerJS logs a reason to stop at. */
const STRYKER_ERROR = /\bERROR\b/u;

/** Enough of what is wrong with a report to find it in the kept output. */
const PROBLEM_CHARACTERS = 1_000;

/**
 * One run: its request, how text written in its working copy is kept, and
 * whether it measures the mutants or only lists them.
 */
interface Run {
  readonly request: MutationRunRequest;
  readonly scrub: Scrub;
  readonly kind: 'measure' | 'listing';
}

/** The tool found no test to run, and stopped with no failure. */
const NO_TEST = { outcome: 'no_test' } as const;

type Concluded = MutationRunResult | typeof NO_TEST;

function succeeded(result: SandboxCommandResult): boolean {
  return result.outcome === 'exited' && result.exitCode === 0;
}

function endingOf(result: SandboxCommandResult): string {
  if (result.outcome === 'timed_out') {
    return 'it ran out of its time limit.';
  }
  const code = result.exitCode === null ? 'no code' : String(result.exitCode);
  return `it exited with ${code}.`;
}

/**
 * The final report, or `null` when the tool wrote none. What is wrong with
 * a report names places in it, such as a test file by its path, so it is
 * kept short and without the path of the copy.
 */
function finalReportOf(run: Run): StrykerReport | null {
  const reading = readStrykerReport(run.request.workingCopyPath, REPORT_FILE);
  if (reading.outcome === 'invalid') {
    const problem = run.scrub(`${REPORT_FILE}: ${reading.problem}`);
    throw new UnreadableMutationReportError(
      capped(problem, PROBLEM_CHARACTERS),
    );
  }
  return reading.outcome === 'read' ? reading.report : null;
}

/**
 * The tool wrote no report. It stops that way when it cannot run on the
 * project, such as when the tests fail before any mutant or the runner
 * plugin does not load.
 */
function stoppedEarly(
  result: SandboxCommandResult,
  output: string,
  outputReference: string,
): MutationRunResult {
  const summary = `${TOOL_NAME} stopped before any mutant ran: ${endingOf(result)}`;
  return {
    outcome: 'unsupported',
    detail: detailOf(summary, output, STRYKER_ERROR),
    outputReference,
  };
}

/**
 * Runs StrykerJS on one file in the sandbox. The install is a call of its
 * own, with the network open and no script, made before code of the
 * repository runs in the copy. A run writes a configuration of its own,
 * runs the tool with no network and reads what it wrote. A run with a
 * patch starts from the cache of the baseline. The whole run is limited
 * by the time of the request, because the tool limits only the time of
 * one mutant.
 */
@Injectable()
export class StrykerMutationRunner implements MutationRunner {
  private readonly sandbox: Sandbox;
  private readonly artifacts: ArtifactStore;
  private readonly settings: MutationSettings;

  public constructor(
    @Inject(SANDBOX) sandbox: Sandbox,
    @Inject(ARTIFACT_STORE) artifacts: ArtifactStore,
    @Inject(MUTATION_SETTINGS) settings: MutationSettings,
  ) {
    this.sandbox = sandbox;
    this.artifacts = artifacts;
    this.settings = settings;
  }

  public async installTool(
    request: MutationToolRequest,
    signal: AbortSignal,
  ): Promise<MutationToolResult> {
    signal.throwIfAborted();
    const result = await this.sandbox.run(
      {
        workingCopyPath: request.workingCopyPath,
        command: installCommandOf(request, this.settings),
        environment: this.settings.commandEnvironment,
        network: 'open',
        timeoutMs: this.settings.installTimeoutMs,
      },
      signal,
    );
    return succeeded(result)
      ? { outcome: 'installed' }
      : this.notInstalled(request, result);
  }

  public async measureBaseline(
    request: MutationRunRequest,
    signal: AbortSignal,
  ): Promise<MutationRunResult> {
    return this.measure(request, null, signal);
  }

  public async measureWithPatch(
    request: PatchedMutationRunRequest,
    signal: AbortSignal,
  ): Promise<MutationRunResult> {
    return this.measure(request, request.baselineCacheReference, signal);
  }

  private async measure(
    request: MutationRunRequest,
    baselineCache: string | null,
    signal: AbortSignal,
  ): Promise<MutationRunResult> {
    signal.throwIfAborted();
    const run: Run = {
      request,
      scrub: scrubberOf(request.workingCopyPath),
      kind: 'measure',
    };
    await this.prepare(request, baselineCache);
    const result = await this.conclude(
      run,
      await this.runTool(request, signal),
    );
    return result.outcome === 'no_test'
      ? this.listMutants(run, signal)
      : result;
  }

  /**
   * The files left out held every test, so the tool ran none. A second
   * run, with a command that passes in place of the runner, still lists
   * every mutant of the target, and none of them is detected.
   */
  private async listMutants(
    run: Run,
    signal: AbortSignal,
  ): Promise<MutationRunResult> {
    const { request } = run;
    prepareFolder(request.workingCopyPath, {
      [CONFIG_FILE]: listingConfigurationOf(request, this.settings),
    });
    const result = await this.conclude(
      { ...run, kind: 'listing' },
      await this.runTool(request, signal),
    );
    if (result.outcome === 'no_test') {
      throw new UnreadableMutationReportError(
        `${TOOL_NAME} ended without a failure and wrote no ${REPORT_FILE}.`,
      );
    }
    return result;
  }

  private async notInstalled(
    request: MutationToolRequest,
    result: SandboxCommandResult,
  ): Promise<MutationToolResult> {
    const output = scrubberOf(request.workingCopyPath)(result.output);
    const summary =
      `${TOOL_NAME} ${this.settings.toolVersion} and its ` +
      `${request.testRunner} runner could not be installed: ${endingOf(result)}`;
    return {
      outcome: 'unsupported',
      detail: detailOf(summary, output, NPM_ERROR),
      outputReference: await this.keep(request, 'mutation-install', output),
    };
  }

  /**
   * Writes the configuration, and for a patch the cache of the baseline
   * where the tool looks for its own.
   */
  private async prepare(
    request: MutationRunRequest,
    baselineCache: string | null,
  ): Promise<void> {
    const configuration = strykerConfigurationOf(request, this.settings);
    const cache = await this.usableCache(baselineCache);
    prepareFolder(request.workingCopyPath, {
      [CONFIG_FILE]: configuration,
      ...(cache === null ? {} : { [CACHE_FILE]: cache }),
    });
  }

  /** A cache the store lost or cannot parse is left out: the run starts cold. */
  private async usableCache(reference: string | null): Promise<string | null> {
    const cache =
      reference === null ? null : await this.artifacts.read(reference);
    const usable =
      cache !== null && parseStrykerReport(cache).outcome === 'read';
    return usable ? cache : null;
  }

  private async runTool(
    request: MutationRunRequest,
    signal: AbortSignal,
  ): Promise<SandboxCommandResult> {
    return this.sandbox.run(
      {
        workingCopyPath: request.workingCopyPath,
        command: RUN_COMMAND,
        environment: {
          ...this.settings.commandEnvironment,
          ...runVariablesOf(request.workingCopyPath),
        },
        network: 'none',
        timeoutMs: request.timeoutMs,
      },
      signal,
    );
  }

  private async conclude(
    run: Run,
    result: SandboxCommandResult,
  ): Promise<Concluded> {
    const { request, scrub } = run;
    const output = scrub(result.output);
    const outputReference = await this.keep(request, 'mutation-run', output);
    if (result.outcome === 'timed_out') {
      const cacheReference = await this.keepCache(run);
      return { outcome: 'timed_out', cacheReference, outputReference };
    }
    const report = finalReportOf(run);
    if (report === null) {
      return succeeded(result)
        ? NO_TEST
        : stoppedEarly(result, output, outputReference);
    }
    return {
      outcome: 'completed',
      tool: {
        name: TOOL_NAME,
        version: this.settings.toolVersion,
        testRunner: request.testRunner,
      },
      ...(run.kind === 'listing' ? listedMutantsOf : mutantsOf)(
        report,
        request.targetFile,
        scrub,
      ),
      cacheReference: await this.keepCache(run),
      outputReference,
    };
  }

  /**
   * The cache only saves time, and the tool saves it after a stop as
   * well. One that is missing or cannot be parsed is not kept, and the
   * next run starts cold.
   */
  private async keepCache(run: Run): Promise<string | null> {
    const { request, scrub } = run;
    const reading = readStrykerReport(request.workingCopyPath, CACHE_FILE);
    return reading.outcome === 'read'
      ? this.keep(request, 'mutation-cache', cacheTextOf(reading.report, scrub))
      : null;
  }

  private async keep(
    request: MutationToolRequest,
    label: string,
    content: string,
  ): Promise<string> {
    return this.artifacts.save({ owner: request.owner, label, content });
  }
}
