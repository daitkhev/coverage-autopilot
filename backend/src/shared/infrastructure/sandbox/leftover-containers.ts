import {
  listArguments,
  NAME_PREFIX,
} from '#infrastructure/sandbox/container-arguments';
import { removeContainer } from '#infrastructure/sandbox/container-removal';
import { askEngine } from '#infrastructure/sandbox/engine-answer';
import { SandboxListFailedError } from '#infrastructure/sandbox/errors/sandbox-list-failed.error';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/** A container that stays, and what the engine said of it. */
interface LeftContainer {
  readonly name: string;
  readonly detail: string;
}

/** What a removal of the containers of an instance did. */
export interface ContainerSweep {
  readonly removed: readonly string[];
  readonly left: readonly LeftContainer[];
}

/**
 * A name the sandbox gives, made of the prefix and an id. Whatever else
 * the engine prints, such as a warning, is not a name to remove.
 */
const OWN_NAME = new RegExp(`^${NAME_PREFIX}[0-9a-f-]+$`, 'u');

/** The containers the engine says carry the label of the instance. */
async function namesOf(settings: SandboxSettings): Promise<string[]> {
  const answer = await askEngine(settings, listArguments(settings.instance));
  if (answer.outcome === 'silent') {
    throw new SandboxListFailedError(
      'The engine did not list the containers of the instance within ' +
        `${String(answer.waitedSeconds)} seconds.`,
    );
  }
  if (answer.exitCode !== 0) {
    throw new SandboxListFailedError(
      'The engine did not list the containers of the instance. It said: ' +
        answer.output.trim(),
    );
  }
  return answer.output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => OWN_NAME.test(line));
}

/**
 * Removes every container labelled with the instance, whether it runs or
 * not. Only a start of the service does it, under the lock of the
 * instance and before any job runs, so none of them belongs to a run that
 * goes on. A container of another instance has another label, and one
 * the service did not name is left alone. Throws when the engine does not
 * list them.
 */
export async function removeLeftoverContainers(
  settings: SandboxSettings,
): Promise<ContainerSweep> {
  const names = await namesOf(settings);
  const removals = await Promise.all(
    names.map(async (name) => ({
      name,
      removal: await removeContainer(settings, name),
    })),
  );
  return {
    removed: removals
      .filter(({ removal }) => removal.outcome === 'removed')
      .map(({ name }) => name),
    left: removals.flatMap(({ name, removal }) =>
      removal.outcome === 'left' ? [{ name, detail: removal.detail }] : [],
    ),
  };
}
