import { Inject, Injectable } from '@nestjs/common';

import { ToolLog } from '#infrastructure/logging/tool-log';
import {
  NAME_PREFIX,
  runArguments,
} from '#infrastructure/sandbox/container-arguments';
import { removeContainer } from '#infrastructure/sandbox/container-removal';
import { notRunningFault } from '#infrastructure/sandbox/engine-faults';
import {
  type EngineExit,
  EngineProcess,
} from '#infrastructure/sandbox/engine-process';
import { SandboxContainerLeftError } from '#infrastructure/sandbox/errors/sandbox-container-left.error';
import { SandboxStartFailedError } from '#infrastructure/sandbox/errors/sandbox-start-failed.error';
import type { OutputTail } from '#infrastructure/sandbox/output-tail';
import { limitRun } from '#infrastructure/sandbox/run-limit';
import { SandboxImages } from '#infrastructure/sandbox/sandbox-images';
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
import { LOGGER, type Logger } from '#ports/logger.port';
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
  throw (
    notRunningFault(said) ??
    new SandboxStartFailedError(
      `The container engine did not start the command. It said: ${said}`,
    )
  );
}

/**
 * Runs each command in a container of its own through the `docker`
 * program, or another with the same arguments. A container is removed on
 * every path: after an exit, a time limit, an abort and a fault. A run
 * whose container may still live after its command is a fault, since the
 * container may still write into the copy the caller is about to read.
 * Before its first command the engine is made to have the image, so the
 * engine never looks for it in a registry on its own.
 */
@Injectable()
export class DockerSandbox implements Sandbox {
  private readonly settings: SandboxSettings;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly log: ToolLog;
  private readonly images: SandboxImages;

  public constructor(
    @Inject(SANDBOX_SETTINGS) settings: SandboxSettings,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
    @Inject(LOGGER) logger: Logger,
    @Inject(SandboxImages) images: SandboxImages,
  ) {
    this.settings = settings;
    this.clock = clock;
    this.ids = ids;
    this.log = new ToolLog(logger, clock);
    this.images = images;
  }

  public async run(
    request: SandboxCommandRequest,
    signal: AbortSignal,
  ): Promise<SandboxCommandResult> {
    signal.throwIfAborted();
    checkRequest(request);
    await this.images.ready(this.settings, signal);
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
      await removeContainer(this.settings, name, this.log);
      throw error;
    }
  }

  private async attend(
    name: string,
    request: SandboxCommandRequest,
    signal: AbortSignal,
  ): Promise<Ending> {
    const program = request.command.slice(0, 1);
    const engine = new EngineProcess(
      this.settings.engine,
      {
        arguments: runArguments(this.settings, name, request),
        shown: runArguments(this.settings, name, {
          ...request,
          command: program,
        }),
        input: environmentFile(request.environment),
        outputBytes: this.settings.limits.outputBytes,
      },
      this.log,
    );
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
    const removal = await removeContainer(this.settings, name, this.log);
    if (removal.outcome === 'left') {
      throw new SandboxContainerLeftError(
        `The container ${name} may still run once its command ended, and ` +
          `write into ${copy}, so nothing of the run is to be read from it. ` +
          removal.detail,
      );
    }
  }
}
