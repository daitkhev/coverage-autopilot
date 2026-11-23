import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { readCopyFile } from '#infrastructure/files/copy-file';
import { ARTIFACT_STORE, type ArtifactStore } from '#ports/artifact-store.port';
import {
  SANDBOX,
  type Sandbox,
  type SandboxCommandResult,
} from '#ports/sandbox.port';
import type {
  TypeChecker,
  TypeCheckRequest,
  TypeCheckResult,
} from '#verification/application/ports/type-checker.port';
import {
  VERIFICATION_SETTINGS,
  type VerificationSettings,
} from '#verification/application/verification-settings';

/**
 * Started by its path inside the package, so no script and no link of the
 * repository can put another program in its place.
 */
const COMPILER = 'node_modules/typescript/bin/tsc';

/** The configuration at the root, the one the project type-checks with. */
const CONFIGURATION = 'tsconfig.json';

function outcomeOf(
  result: SandboxCommandResult,
): 'passes' | 'fails' | 'timed_out' {
  if (result.outcome === 'timed_out') {
    return 'timed_out';
  }
  return result.exitCode === 0 ? 'passes' : 'fails';
}

/**
 * The project's own TypeScript compiler, run in the sandbox with no
 * network and no output of files. The working copy is written by code of
 * the repository, so the host only asks whether the two files are there,
 * through the one reader of such files. A link counts as there: only the
 * compiler follows it, inside the sandbox.
 */
@Injectable()
export class TscTypeChecker implements TypeChecker {
  private readonly sandbox: Sandbox;
  private readonly artifacts: ArtifactStore;
  private readonly settings: VerificationSettings;

  public constructor(
    @Inject(SANDBOX) sandbox: Sandbox,
    @Inject(ARTIFACT_STORE) artifacts: ArtifactStore,
    @Inject(VERIFICATION_SETTINGS) settings: VerificationSettings,
  ) {
    this.sandbox = sandbox;
    this.artifacts = artifacts;
    this.settings = settings;
  }

  public async check(
    request: TypeCheckRequest,
    signal: AbortSignal,
  ): Promise<TypeCheckResult> {
    const root = request.workingCopyPath;
    const present = [COMPILER, CONFIGURATION].every(
      (path) => readCopyFile(root, join(root, path)).outcome !== 'missing',
    );
    if (!present) {
      return { outcome: 'absent' };
    }
    const result = await this.sandbox.run(
      {
        workingCopyPath: root,
        command: [
          'node',
          COMPILER,
          '--noEmit',
          '--pretty',
          'false',
          '--project',
          CONFIGURATION,
        ],
        environment: this.settings.commandEnvironment,
        network: 'none',
        timeoutMs: request.timeoutMs,
      },
      signal,
    );
    const outputReference = await this.artifacts.save({
      owner: request.owner,
      label: 'type-check',
      content: result.output,
    });
    return {
      outcome: outcomeOf(result),
      durationMs: result.durationMs,
      outputReference,
    };
  }
}
