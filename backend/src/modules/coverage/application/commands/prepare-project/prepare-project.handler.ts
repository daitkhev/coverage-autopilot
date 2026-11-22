import { Inject, Injectable } from '@nestjs/common';

import type { PrepareProjectCommand } from '#coverage/application/commands/prepare-project/prepare-project.command';
import {
  COVERAGE_SETTINGS,
  type CoverageSettings,
} from '#coverage/application/coverage-settings';
import type {
  SupportedProject,
  UnsupportedProject,
} from '#coverage/application/ports/project-detector.port';
import { RepositoryDetection } from '#coverage/application/repository-detection';
import { ARTIFACT_STORE, type ArtifactStore } from '#ports/artifact-store.port';
import { SANDBOX, type Sandbox } from '#ports/sandbox.port';

/** `exitCode` is `null` when the install ran out of time. */
export type Preparation =
  | { readonly outcome: 'ready'; readonly detection: SupportedProject }
  | UnsupportedProject
  | {
      readonly outcome: 'install_failed';
      readonly exitCode: number | null;
      readonly outputReference: string;
    };

/**
 * Detects the project and installs its locked packages, as its repository
 * is installed now. The install is the one command with the network open.
 * Sandboxed, it runs no script of a package, so no code of the repository
 * runs while the network is open; trusted, it runs them as the developers
 * of the repository do.
 */
@Injectable()
export class PrepareProjectHandler {
  private readonly detection: RepositoryDetection;
  private readonly sandbox: Sandbox;
  private readonly artifacts: ArtifactStore;
  private readonly settings: CoverageSettings;

  public constructor(
    @Inject(RepositoryDetection) detection: RepositoryDetection,
    @Inject(SANDBOX) sandbox: Sandbox,
    @Inject(ARTIFACT_STORE) artifacts: ArtifactStore,
    @Inject(COVERAGE_SETTINGS) settings: CoverageSettings,
  ) {
    this.detection = detection;
    this.sandbox = sandbox;
    this.artifacts = artifacts;
    this.settings = settings;
  }

  public async execute(
    command: PrepareProjectCommand,
    signal: AbortSignal,
  ): Promise<Preparation> {
    const detection = await this.detection.detect(command);
    if (detection.outcome === 'unsupported') {
      return detection;
    }
    const { install } = detection;
    const result = await this.sandbox.run(
      {
        workingCopyPath: command.workingCopyPath,
        command: install.command,
        environment: {
          ...this.settings.commandEnvironment,
          ...install.environment,
        },
        network: 'open',
        timeoutMs: this.settings.installTimeoutMs,
      },
      signal,
    );
    const outputReference = await this.artifacts.save({
      owner: command.owner,
      label: 'install',
      content: result.output,
    });
    return result.exitCode === 0
      ? { outcome: 'ready', detection }
      : {
          outcome: 'install_failed',
          exitCode: result.exitCode,
          outputReference,
        };
  }
}
