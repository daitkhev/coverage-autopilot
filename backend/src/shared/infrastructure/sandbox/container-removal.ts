import { removeArguments } from '#infrastructure/sandbox/container-arguments';
import { EngineProcess } from '#infrastructure/sandbox/engine-process';
import { limitRun } from '#infrastructure/sandbox/run-limit';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/**
 * Whether the container is gone, or why it may still run. `left` is told
 * apart from `removed` only by what the engine said: a stuck engine and a
 * container that holds on look the same from here.
 */
export type ContainerRemoval =
  | { readonly outcome: 'removed' }
  | { readonly outcome: 'left'; readonly detail: string };

/** What the engine answered a short call, or that it did not in time. */
type EngineAnswer =
  | {
      readonly outcome: 'answered';
      readonly exitCode: number | null;
      readonly output: string;
    }
  | { readonly outcome: 'silent' };

/** A call that takes longer means a stuck engine, and nothing waits on it. */
const ANSWER_TIMEOUT_MS = 30_000;

const MS_PER_SECOND = 1_000;

/** Nobody aborts a short call: its time limit ends it. */
const UNSTOPPABLE = new AbortController().signal;

/**
 * What docker and podman say for a name no container has. `--rm` removes
 * a container once its command ends, so this is how a removal after an
 * exit usually ends.
 */
const NO_SUCH_CONTAINER = /no such container/i;

const REMOVED: ContainerRemoval = { outcome: 'removed' };

/** Starts the engine for a call that ends at once, and kills it after. */
async function askEngine(
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
      ? { outcome: 'silent' }
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

function removalOf(answer: EngineAnswer): ContainerRemoval {
  if (answer.outcome === 'silent') {
    const seconds = String(ANSWER_TIMEOUT_MS / MS_PER_SECOND);
    return {
      outcome: 'left',
      detail: `The engine did not answer the removal within ${seconds} seconds.`,
    };
  }
  if (answer.exitCode === 0 || NO_SUCH_CONTAINER.test(answer.output)) {
    return REMOVED;
  }
  return {
    outcome: 'left',
    detail: `The engine did not remove it. It said: ${answer.output.trim()}`,
  };
}

/** Stops the container if it still runs and removes it. Never throws. */
export async function removeContainer(
  settings: SandboxSettings,
  name: string,
): Promise<ContainerRemoval> {
  try {
    return removalOf(await askEngine(settings, removeArguments(name)));
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    return { outcome: 'left', detail: said };
  }
}
