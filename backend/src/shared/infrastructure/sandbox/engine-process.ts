import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

import type { ToolEnd, ToolLog } from '#infrastructure/logging/tool-log';
import { SandboxEngineMissingError } from '#infrastructure/sandbox/errors/sandbox-engine-missing.error';
import { OutputTail } from '#infrastructure/sandbox/output-tail';
import type { SandboxEngine } from '#infrastructure/sandbox/sandbox-settings';

/** How the program ended. No code when a signal ended it. */
export interface EngineExit {
  readonly code: number | null;
}

/** One start of the program of the engine. */
export interface EngineCall {
  readonly arguments: readonly string[];
  /**
   * The arguments as its line shows them. The command a container runs
   * may carry a prompt or the text of a file, so a run shows its program
   * alone.
   */
  readonly shown: readonly string[];
  /** What the program reads on its standard input. */
  readonly input: string;
  readonly outputBytes: number;
}

/**
 * The program of the engine, started with the environment of its settings
 * alone. Both of its streams go into one tail, in the order they came.
 * Its log hears the call once the program ended, or did not start.
 */
export class EngineProcess {
  public readonly output: OutputTail;
  /** Rejects with `SandboxEngineMissingError` when the program never ran. */
  public readonly exit: Promise<EngineExit>;
  private readonly child: ChildProcessWithoutNullStreams;

  public constructor(engine: SandboxEngine, call: EngineCall, log: ToolLog) {
    const [program, ...first] = engine.command;
    const { promise, resolve, reject } = Promise.withResolvers<EngineExit>();
    this.output = new OutputTail(call.outputBytes);
    this.exit = promise;
    void this.tell(
      log.started({ program, arguments: [...first, ...call.shown] }),
    );
    this.child = spawn(program, [...first, ...call.arguments], {
      env: engine.environment,
      stdio: 'pipe',
    });
    this.child.on('error', (error) => {
      reject(
        new SandboxEngineMissingError(
          `The program of the container engine, ${program}, could not be ` +
            'started.',
          { cause: error },
        ),
      );
    });
    this.child.on('close', (code: number | null) => {
      resolve({ code });
    });
    this.keepOutput();
    this.child.stdin.end(call.input);
  }

  /** Kills the program and waits until it is gone, however it ended. */
  public async stop(): Promise<void> {
    this.child.kill('SIGKILL');
    try {
      await this.exit;
    } catch {
      // A program that never started is gone as well.
    }
  }

  private async tell(ended: ToolEnd): Promise<void> {
    try {
      ended((await this.exit).code);
    } catch {
      ended(null);
    }
  }

  private keepOutput(): void {
    const keep = (chunk: Buffer): void => {
      this.output.append(chunk);
    };
    this.child.stdout.on('data', keep);
    this.child.stderr.on('data', keep);
    this.child.stdin.on('error', () => {
      // The program may end before it reads what it is given.
    });
  }
}
