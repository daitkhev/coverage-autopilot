import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

import type { ToolLog, ToolStart } from '#infrastructure/logging/tool-log';
import { killGroup } from '#infrastructure/processes/kill-group';
import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { ToolMissingError } from '#repositories/infrastructure/errors/tool-missing.error';
import { ToolOutputTooLargeError } from '#repositories/infrastructure/errors/tool-output-too-large.error';
import { ToolStoppedError } from '#repositories/infrastructure/errors/tool-stopped.error';
import { ToolTimedOutError } from '#repositories/infrastructure/errors/tool-timed-out.error';
import type { ToolSettings } from '#repositories/infrastructure/repositories-settings';

/** The contract keeps no more of an answer than this, and a user reads less. */
const KEPT_CHARACTERS = 4096;

/**
 * 64 MiB: far more than the patch of one improvement, and far less than
 * the memory of a host.
 */
const DEFAULT_OUTPUT_LIMIT_BYTES = 67_108_864;

/** What stands in an output where a secret was. */
const HIDDEN = '[hidden]';

const NOT_FOUND = 'ENOENT';

export interface ToolCall {
  readonly arguments: readonly string[];
  /** Where the program starts. It exists: there is no default. */
  readonly directory: string;
  /** Written to the standard input, which is closed after it. */
  readonly input?: string;
}

export interface ToolRun {
  readonly exitCode: number;
  /** The standard output as the program wrote it, to be read as data. */
  readonly stdout: string;
  /**
   * Both streams in the order they came, with every secret hidden and the
   * end alone kept. This is what a message or a user may see.
   */
  readonly output: string;
}

export interface ToolRunnerOptions {
  /** The name of the tool in messages, such as `git`. */
  readonly name: string;
  readonly settings: ToolSettings;
  /** Values that never leave the runner in an output, a message or a line. */
  readonly secrets: readonly string[];
  /** Hears each call, with its arguments as `secrets` leave them. */
  readonly log: ToolLog;
}

type StopReason = 'none' | 'timed_out' | 'stopped' | 'too_large';

interface Watch {
  readonly reason: () => StopReason;
  /** Stops the program. The first reason given is the one kept. */
  readonly end: (why: StopReason) => void;
  readonly release: () => void;
}

interface Streams {
  readonly stdout: Buffer[];
  readonly both: Buffer[];
}

/**
 * The streams of the program up to the limit. Past it nothing more is
 * kept and the program is stopped, so the memory it takes stays bounded.
 */
function collect(
  child: ChildProcessWithoutNullStreams,
  limitBytes: number,
  overflow: () => void,
): Streams {
  const streams: Streams = { stdout: [], both: [] };
  let bytes = 0;
  const take = (chunk: Buffer, stdout: Buffer[] | null): void => {
    bytes += chunk.length;
    if (bytes > limitBytes) {
      overflow();
      return;
    }
    stdout?.push(chunk);
    streams.both.push(chunk);
  };
  child.stdout.on('data', (chunk: Buffer) => {
    take(chunk, streams.stdout);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    take(chunk, null);
  });
  return streams;
}

function watch(
  child: ChildProcessWithoutNullStreams,
  signal: AbortSignal,
  timeoutMs: number,
): Watch {
  let reason: StopReason = 'none';
  const end = (why: StopReason): void => {
    if (reason === 'none') {
      reason = why;
    }
    killGroup(child);
  };
  const timer = setTimeout(() => {
    end('timed_out');
  }, timeoutMs);
  const onAbort = (): void => {
    end('stopped');
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    reason: () => reason,
    end,
    release: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    },
  };
}

function exitOf(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code: number | null) => {
      resolve(code);
    });
  });
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === NOT_FOUND;
}

/**
 * Starts one program of the host with a list of arguments, never a line
 * for a shell, in an explicit folder, with exactly the variables of its
 * settings. It stops the program at its time limit, past its limit of
 * output or when the caller's signal aborts, and tells a missing program
 * from one that failed.
 */
export class ToolRunner {
  private readonly name: string;
  private readonly settings: ToolSettings;
  private readonly secrets: readonly string[];
  private readonly log: ToolLog;

  public constructor(options: ToolRunnerOptions) {
    this.name = options.name;
    this.settings = options.settings;
    this.secrets = options.secrets;
    this.log = options.log;
  }

  /** A program that ran and failed is a value: its exit code says so. */
  public async run(call: ToolCall, signal: AbortSignal): Promise<ToolRun> {
    if (signal.aborted) {
      throw this.stoppedError(call);
    }
    const ended = this.log.started(this.shown(call));
    const child = this.start(call);
    const watched = watch(child, signal, this.settings.timeoutMs);
    const streams = collect(child, this.outputLimitBytes(), () => {
      watched.end('too_large');
    });
    let exitCode: number | null = null;
    try {
      exitCode = await exitOf(child);
    } catch (error) {
      throw this.startError(error);
    } finally {
      watched.release();
      ended(exitCode);
    }
    return this.finish(call, watched.reason(), { exitCode, streams });
  }

  /** For a call that has no expected failure: one is a fault. */
  public async runChecked(
    call: ToolCall,
    signal: AbortSignal,
  ): Promise<ToolRun> {
    const run = await this.run(call, signal);
    if (run.exitCode !== 0) {
      throw new ToolFailedError(
        `${this.describe(call)} failed with the exit code ${String(run.exitCode)}. It said: ${run.output}`,
      );
    }
    return run;
  }

  /** The text with every secret hidden and the end alone kept. */
  public kept(text: string): string {
    return this.hidden(text).trim().slice(-KEPT_CHARACTERS);
  }

  private hidden(text: string): string {
    return this.secrets.reduce(
      (result, secret) => result.replaceAll(secret, HIDDEN),
      text,
    );
  }

  /** The call as its line shows it. Its input is never shown. */
  private shown(call: ToolCall): ToolStart {
    const [program = '', ...leading] = this.settings.command;
    const all = [...leading, ...call.arguments];
    return { program, arguments: all.map((part) => this.hidden(part)) };
  }

  private start(call: ToolCall): ChildProcessWithoutNullStreams {
    const [program = '', ...leading] = this.settings.command;
    const child = spawn(program, [...leading, ...call.arguments], {
      cwd: call.directory,
      env: { ...this.settings.environment },
      stdio: 'pipe',
      detached: true,
    });
    // A program may end before it reads its input. That is its answer.
    child.stdin.on('error', () => undefined);
    child.stdin.end(call.input ?? '');
    return child;
  }

  private finish(
    call: ToolCall,
    reason: StopReason,
    ended: { readonly exitCode: number | null; readonly streams: Streams },
  ): ToolRun {
    if (reason === 'stopped') {
      throw this.stoppedError(call);
    }
    if (reason === 'timed_out') {
      throw new ToolTimedOutError(
        `${this.describe(call)} ran longer than ${String(this.settings.timeoutMs)} ms and was stopped.`,
      );
    }
    if (reason === 'too_large') {
      throw new ToolOutputTooLargeError(
        `${this.describe(call)} wrote more than ${String(this.outputLimitBytes())} bytes and was stopped.`,
      );
    }
    const output = this.kept(Buffer.concat(ended.streams.both).toString());
    if (ended.exitCode === null) {
      throw new ToolFailedError(
        `${this.describe(call)} was ended by a signal. It said: ${output}`,
      );
    }
    const stdout = Buffer.concat(ended.streams.stdout).toString();
    return { exitCode: ended.exitCode, stdout, output };
  }

  private startError(error: unknown): Error {
    if (isNotFound(error)) {
      return new ToolMissingError(
        `${this.name} is not installed, or not on the PATH it was given.`,
      );
    }
    return new ToolFailedError(`${this.name} could not be started.`, {
      cause: error,
    });
  }

  private stoppedError(call: ToolCall): ToolStoppedError {
    return new ToolStoppedError(
      `${this.describe(call)} was stopped by its caller.`,
    );
  }

  private outputLimitBytes(): number {
    return this.settings.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES;
  }

  private describe(call: ToolCall): string {
    return [this.name, call.arguments[0] ?? ''].join(' ').trim();
  }
}
