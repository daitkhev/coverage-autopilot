import { EngineProcess } from '#infrastructure/sandbox/engine-process';
import { limitRun } from '#infrastructure/sandbox/run-limit';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/** What the engine answered a short call, or how long it was waited for. */
export type EngineAnswer =
  | {
      readonly outcome: 'answered';
      readonly exitCode: number | null;
      readonly output: string;
    }
  | { readonly outcome: 'silent'; readonly waitedSeconds: number };

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
): Promise<EngineAnswer> {
  const call = new EngineProcess(settings.engine, {
    arguments: args,
    input: '',
    outputBytes: settings.limits.outputBytes,
  });
  const limit = limitRun(ANSWER_TIMEOUT_MS, UNSTOPPABLE);
  try {
    const first = await Promise.race([call.exit, limit.reached]);
    return typeof first === 'string'
      ? { outcome: 'silent', waitedSeconds: ANSWER_TIMEOUT_MS / MS_PER_SECOND }
      : {
          outcome: 'answered',
          exitCode: first.code,
          output: call.output.text(),
        };
  } finally {
    limit.release();
    await call.stop();
  }
}
