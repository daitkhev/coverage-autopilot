import { Inject, Injectable } from '@nestjs/common';

import {
  NAME_PREFIX,
  runArguments,
} from '#infrastructure/sandbox/container-arguments';
import { removeContainer } from '#infrastructure/sandbox/container-removal';
import {
  type EngineExit,
  EngineProcess,
} from '#infrastructure/sandbox/engine-process';
import { SandboxContainerLeftError } from '#infrastructure/sandbox/errors/sandbox-container-left.error';
import { SandboxEngineNotRunningError } from '#infrastructure/sandbox/errors/sandbox-engine-not-running.error';
import { SandboxStartFailedError } from '#infrastructure/sandbox/errors/sandbox-start-failed.error';
import type { OutputTail } from '#infrastructure/sandbox/output-tail';
import { limitRun } from '#infrastructure/sandbox/run-limit';
import {
  checkRequest,
  environmentFile,
} from '#infrastructure/sandbox/sandbox-request';
import {
  SANDBOX_SETTINGS,
  type SandboxSettings,
} from '#infrastructure/sandbox/sandbox-settings';
import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type {
  Sandbox,
  SandboxCommandRequest,
  SandboxCommandResult,
} from '#ports/sandbox.port';

/**
 * `docker run` exits with 125 when the engine failed and the command never
 * ran. A command that exits with 125 itself is taken for the same.
 */
const ENGINE_FAILED = 125;

/** What docker and podman print when no engine answers them. */
const NOT_RUNNING =
  /cannot connect to the docker daemon|failed to connect to the docker api|is the docker daemon running|cannot connect to podman/i;

type Ending = Omit<SandboxCommandResult, 'durationMs'>;

function textOf(
  output: OutputTail,
): Pick<Ending, 'output' | 'outputTruncated'> {
  return { output: output.text(), outputTruncated: output.truncated };
}

function endingOf(exit: EngineExit, output: OutputTail): Ending {
  if (exit.code !== ENGINE_FAILED) {
    return { outcome: 'exited', exitCode: exit.code, ...textOf(output) };
  }
  const said = output.text().trim();
  throw NOT_RUNNING.test(said)
    ? new SandboxEngineNotRunningError(
        `No container engine answers. Start it and try again. It said: ${said}`,
      )
    : new SandboxStartFailedError(
        `The container engine did not start the command. It said: ${said}`,
      );
}

/**
 * Runs each command in a container of its own through the `docker`
 * program, or another with the same arguments. A container is removed on
 * every path: after an exit, a time limit, an abort and a fault. A run
 * whose container may still live after its command is a fault, since the
 * container may still write into the copy the caller is about to read.
 */
@Injectable()
export class DockerSandbox implements Sandbox {
  private readonly settings: SandboxSettings;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  public constructor(
    @Inject(SANDBOX_SETTINGS) settings: SandboxSettings,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
  ) {
    this.settings = settings;
    this.clock = clock;
    this.ids = ids;
  }

  public async run(
    request: SandboxCommandRequest,
    signal: AbortSignal,
  ): Promise<SandboxCommandResult> {
    signal.throwIfAborted();
    checkRequest(request);
    const name = `${NAME_PREFIX}${this.ids.generate()}`;
    const started = this.clock.now().epochMilliseconds;
    const ending = await this.attendOrRemove(name, request, signal);
    const durationMs = this.clock.now().epochMilliseconds - started;
    await this.removeAfter(name, request.workingCopyPath);
    return { ...ending, durationMs };
  }

  /**
   * A run that fails or is stopped removes its container all the same.
   * Its own error says more than one of the removal, and the caller reads
   * nothing from the copy after an error.
   */
  private async attendOrRemove(
    name: string,
    request: SandboxCommandRequest,
    signal: AbortSignal,
  ): Promise<Ending> {
    try {
      return await this.attend(name, request, signal);
    } catch (error) {
      await removeContainer(this.settings, name);
      throw error;
    }
  }

  private async attend(
    name: string,
    request: SandboxCommandRequest,
    signal: AbortSignal,
  ): Promise<Ending> {
    const engine = new EngineProcess(this.settings.engine, {
      arguments: runArguments(this.settings, name, request),
      input: environmentFile(request.environment),
      outputBytes: this.settings.limits.outputBytes,
    });
    const limit = limitRun(request.timeoutMs, signal);
    try {
      const first = await Promise.race([engine.exit, limit.reached]);
      if (typeof first !== 'string') {
        return endingOf(first, engine.output);
      }
      await engine.stop();
      // An abort throws the reason of the caller. A time limit is a result.
      signal.throwIfAborted();
      return { outcome: 'timed_out', exitCode: null, ...textOf(engine.output) };
    } finally {
      limit.release();
    }
  }

  private async removeAfter(name: string, copy: string): Promise<void> {
    const removal = await removeContainer(this.settings, name);
    if (removal.outcome === 'left') {
      throw new SandboxContainerLeftError(
        `The container ${name} may still run once its command ended, and ` +
          `write into ${copy}, so nothing of the run is to be read from it. ` +
          removal.detail,
      );
    }
  }
}
