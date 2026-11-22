import { Inject, Injectable } from '@nestjs/common';

import type {
  GenerationRequest,
  GenerationResult,
  TestGenerator,
} from '#improvement/application/ports/test-generator.port';
import { GeneratorLoginFailedError } from '#improvement/infrastructure/errors/generator-login-failed.error';
import {
  claudeCodeArguments,
  claudeCodeEnvironment,
} from '#improvement/infrastructure/generator/claude-code-command';
import {
  readStream,
  wholeLinesOf,
} from '#improvement/infrastructure/generator/claude-stream';
import {
  changesBetween,
  listCopy,
} from '#improvement/infrastructure/generator/copy-listing';
import { searchCredential } from '#improvement/infrastructure/generator/credential-search';
import { withoutCredential } from '#improvement/infrastructure/generator/credential-text';
import type { RunRules } from '#improvement/infrastructure/generator/finished-run';
import { outcomeOf } from '#improvement/infrastructure/generator/generation-outcome';
import { promptFor } from '#improvement/infrastructure/generator/generation-prompt';
import { GENERATOR_SANDBOX } from '#improvement/infrastructure/generator/generator-sandbox';
import {
  GENERATOR_SETTINGS,
  type GeneratorSettings,
  type ReadyGeneratorSettings,
} from '#improvement/infrastructure/generator/generator-settings';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { ARTIFACT_STORE, type ArtifactStore } from '#ports/artifact-store.port';
import type { Sandbox, SandboxCommandResult } from '#ports/sandbox.port';

const LINE_BREAK = '\n';
const LABEL = 'generator-output';
const NOTES_HEADING = '--- notes of the generator adapter ---';

/**
 * The output as it is kept, with the notes of the files that were not
 * searched after it. The credential is replaced in both.
 */
function rawOutputOf(
  ended: SandboxCommandResult,
  notes: readonly string[],
  credential: string,
): string {
  const noted = notes.length === 0 ? [] : [NOTES_HEADING, ...notes, ''];
  const text = [wholeLinesOf(ended), ...noted].join(LINE_BREAK);
  return withoutCredential(text, credential);
}

/**
 * Claude Code in its mode without a terminal, in the generator sandbox.
 * The working copy is listed before and after the run, so a change is
 * seen whatever the CLI says, and every file it wrote is searched for the
 * credential before anything of the run leaves the adapter.
 */
@Injectable()
export class ClaudeCodeGenerator implements TestGenerator {
  private readonly sandbox: Sandbox;
  private readonly artifacts: ArtifactStore;
  private readonly clock: Clock;
  private readonly settings: GeneratorSettings;

  public constructor(
    @Inject(GENERATOR_SANDBOX) sandbox: Sandbox,
    @Inject(ARTIFACT_STORE) artifacts: ArtifactStore,
    @Inject(CLOCK) clock: Clock,
    @Inject(GENERATOR_SETTINGS) settings: GeneratorSettings,
  ) {
    this.sandbox = sandbox;
    this.artifacts = artifacts;
    this.clock = clock;
    this.settings = settings;
  }

  public async generate(
    request: GenerationRequest,
    signal: AbortSignal,
  ): Promise<GenerationResult> {
    signal.throwIfAborted();
    const settings = this.ready();
    const prompt = promptFor(request, settings.credential.value);
    const root = request.workingCopyPath;
    const before = await listCopy(root);
    const ended = await this.run(request, prompt, signal);
    const changes = changesBetween(before, await listCopy(root));
    const search = searchCredential(root, changes.written, settings);
    const outputReference = await this.save(request, ended, search.notes);
    const run = {
      ended,
      stream: readStream(ended),
      changed: changes.any,
      exposed: search.exposed,
      outputReference,
    };
    return outcomeOf(run, this.rules());
  }

  private async save(
    request: GenerationRequest,
    ended: SandboxCommandResult,
    notes: readonly string[],
  ): Promise<string> {
    const credential = this.ready().credential.value;
    return this.artifacts.save({
      owner: request.owner,
      label: LABEL,
      content: rawOutputOf(ended, notes, credential),
    });
  }

  private rules(): RunRules {
    return {
      allowedTools: this.settings.allowedTools,
      credential: this.ready().credential,
      now: this.clock.now(),
    };
  }

  /**
   * The settings with their credential. Without one no run starts: the
   * CLI could not log in, and only the owner can give it one.
   */
  private ready(): ReadyGeneratorSettings {
    const { variable, value } = this.settings.credential;
    if (value === null) {
      throw new GeneratorLoginFailedError(
        `No credential is set in ${variable}, so the CLI cannot log in. ` +
          'Set it and start the service again.',
      );
    }
    return { ...this.settings, credential: { variable, value } };
  }

  private async run(
    request: GenerationRequest,
    prompt: string,
    signal: AbortSignal,
  ): Promise<SandboxCommandResult> {
    return this.sandbox.run(
      {
        workingCopyPath: request.workingCopyPath,
        command: claudeCodeArguments(this.settings, request, prompt),
        environment: claudeCodeEnvironment(this.ready()),
        network: 'open',
        timeoutMs: request.limits.timeoutMs,
      },
      signal,
    );
  }
}
