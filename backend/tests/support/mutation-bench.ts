import { FilePath } from '#kernel/primitives/file-path';
import {
  type InMemoryArtifacts,
  inMemoryArtifacts,
} from '#tests/support/coverage-stand-ins';
import { baselineReport, TARGET } from '#tests/support/mutation-reports';
import {
  CACHE,
  MUTATION_TEST_SETTINGS,
  REPORT,
  StrykerStandIn,
} from '#tests/support/mutation-stand-ins';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import type {
  CompletedMutationRun,
  MutationRunRequest,
  MutationRunResult,
} from '#verification/application/ports/mutation-runner.port';
import { StrykerMutationRunner } from '#verification/infrastructure/mutation/stryker-mutation-runner.adapter';

export const OWNER = 'improvement:7';

/** The time of a run, as the request gives it. */
export const RUN_TIMEOUT_MS = 900_000;

const NEVER = new AbortController().signal;

/**
 * The adapter over a working copy in a temporary folder, a stand-in of
 * the sandbox and tool output in memory. By default the tool writes the
 * baseline report and the same text as its cache. A measure installs the
 * tool first, as the gate does, and goes no further when that fails.
 */
export class MutationBench {
  public readonly folder: ProjectFolder = createProjectFolder();
  public readonly artifacts: InMemoryArtifacts = inMemoryArtifacts();
  public readonly tool: StrykerStandIn;
  public readonly runner: StrykerMutationRunner;

  public constructor() {
    const report = baselineReport(this.folder.root);
    this.tool = new StrykerStandIn({ [REPORT]: report, [CACHE]: report });
    this.runner = new StrykerMutationRunner(
      this.tool.sandbox,
      this.artifacts,
      MUTATION_TEST_SETTINGS,
    );
  }

  public get root(): string {
    return this.folder.root;
  }

  public request(testRunner: 'jest' | 'vitest' = 'vitest'): MutationRunRequest {
    return {
      workingCopyPath: this.root,
      owner: OWNER,
      targetFile: FilePath.create(TARGET),
      testRunner,
      timeoutMs: RUN_TIMEOUT_MS,
    };
  }

  public async measureBaseline(
    request: MutationRunRequest = this.request(),
  ): Promise<MutationRunResult> {
    const installed = await this.runner.installTool(request, NEVER);
    return installed.outcome === 'installed'
      ? this.runner.measureBaseline(request, NEVER)
      : installed;
  }

  public async measureWithPatch(
    baselineCacheReference: string | null,
  ): Promise<MutationRunResult> {
    const request = { ...this.request(), baselineCacheReference };
    const installed = await this.runner.installTool(request, NEVER);
    return installed.outcome === 'installed'
      ? this.runner.measureWithPatch(request, NEVER)
      : installed;
  }

  public remove(): void {
    this.folder.remove();
  }
}

/** The run, when it completed. A test fails on any other outcome. */
export function completed(result: MutationRunResult): CompletedMutationRun {
  if (result.outcome !== 'completed') {
    throw new Error(`The run ended as ${result.outcome}, not completed.`);
  }
  return result;
}
