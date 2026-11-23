import type { ToolLog } from '#infrastructure/logging/tool-log';
import { EngineProcess } from '#infrastructure/sandbox/engine-process';
import { limitRun } from '#infrastructure/sandbox/run-limit';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/** What the engine answered a call, or how long it was waited for. */
export type EngineAnswer =
  | {
      readonly outcome: 'answered';
      readonly exitCode: number | null;
      readonly output: string;
    }
  | { readonly outcome: 'silent'; readonly waitedSeconds: number };

/**
 * Where a call is logged, how long it is waited for, and the signal that
 * stops it sooner.
 */
interface EngineWait {
  readonly log: ToolLog;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

/** A call that takes longer means a stuck engine, and nothing waits on it. */
const ANSWER_TIMEOUT_MS = 30_000;

const MS_PER_SECOND = 1_000;

/** Nobody aborts a short call: its time limit ends it. */
const UNSTOPPABLE = new AbortController().signal;

/**
 * Starts the program of the engine for a call that ends at once, such as
 * a removal or a listing, and kills it after. Throws
 * `SandboxEngineMissingError` when the program cannot be started.
 */
export async function askEngine(
  settings: SandboxSettings,
  args: readonly string[],
  log: ToolLog,
): Promise<EngineAnswer> {
  return awaitEngine(settings, args, {
    log,
    timeoutMs: ANSWER_TIMEOUT_MS,
    signal: UNSTOPPABLE,
  });
}

/**
 * Starts the program of the engine for a call that may take long, such as
 * a build, and kills it after. Its line shows every argument, so none may
 * be secret. Throws `SandboxEngineMissingError` when the program cannot
 * be started, and the reason of the signal once it is aborted.
 */
export async function awaitEngine(
  settings: SandboxSettings,
  args: readonly string[],
  wait: EngineWait,
): Promise<EngineAnswer> {
  wait.signal.throwIfAborted();
  const call = new EngineProcess(
    settings.engine,
    {
      arguments: args,
      shown: args,
      input: '',
      outputBytes: settings.limits.outputBytes,
    },
    wait.log,
  );
  const limit = limitRun(wait.timeoutMs, wait.signal);
  try {
    const first = await Promise.race([call.exit, limit.reached]);
    if (typeof first !== 'string') {
      return {
        outcome: 'answered',
        exitCode: first.code,
        output: call.output.text(),
      };
    }
    wait.signal.throwIfAborted();
    return { outcome: 'silent', waitedSeconds: wait.timeoutMs / MS_PER_SECOND };
  } finally {
    limit.release();
    await call.stop();
  }
}
