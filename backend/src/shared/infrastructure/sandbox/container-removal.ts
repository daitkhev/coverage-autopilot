import { removeArguments } from '#infrastructure/sandbox/container-arguments';
import {
  askEngine,
  type EngineAnswer,
} from '#infrastructure/sandbox/engine-answer';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/**
 * Whether the container is gone, or why it may still run. `left` is told
 * apart from `removed` only by what the engine said: a stuck engine and a
 * container that holds on look the same from here.
 */
export type ContainerRemoval =
  | { readonly outcome: 'removed' }
  | { readonly outcome: 'left'; readonly detail: string };

/**
 * What docker and podman say for a name no container has. `--rm` removes
 * a container once its command ends, so this is how a removal after an
 * exit usually ends.
 */
const NO_SUCH_CONTAINER = /no such container/i;

const REMOVED: ContainerRemoval = { outcome: 'removed' };

function removalOf(answer: EngineAnswer): ContainerRemoval {
  if (answer.outcome === 'silent') {
    const seconds = String(answer.waitedSeconds);
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
