import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { playedContainers } from '#tests/support/played-containers';
import type {
  EndedStart,
  RestartedService,
} from '#tests/support/restarted-service';
import type { SeededRandom } from '#tests/support/seeded-random';

/** What is on disk and at the engine once a start ended. */
interface Leftovers {
  /** The trees and the git directories of working copies, by name. */
  readonly copies: readonly string[];
  readonly containers: readonly string[];
  readonly socket: boolean;
}

/** One start of the service, how it was stopped and what it left. */
export interface Stop extends EndedStart {
  readonly signal: NodeJS.Signals;
  readonly left: Leftovers;
}

/** How many stops, how many of them clean, and when they may come. */
export interface StopPlan {
  readonly stops: number;
  /** How many of them tell the service to end, and are no kill. */
  readonly ends: number;
  /** The longest time from a start to its kill. */
  readonly killWithinMs: number;
  /** The longest time from the first answer of a start to its end. */
  readonly endWithinMs: number;
}

/** What the stops act on and choose with. */
export interface StopScene {
  readonly service: RestartedService;
  readonly random: SeededRandom;
  /** The folder of the stand-in of the engine, which keeps its containers. */
  readonly engineFolder: string;
  /** Aborted when the stops are to end before their number is reached. */
  readonly halt: AbortSignal;
}

/** The folders of the working copies, beside the mirrors they leave be. */
const COPY_FOLDERS = ['copies', 'git-dirs'];

function entriesOf(folder: string): string[] {
  return existsSync(folder) ? readdirSync(folder) : [];
}

function leftoversOf(scene: StopScene): Leftovers {
  const { paths } = scene.service;
  return {
    copies: COPY_FOLDERS.flatMap((folder) =>
      entriesOf(join(paths.workingCopies, folder)).map(
        (name) => `${folder}/${name}`,
      ),
    ),
    containers: playedContainers(scene.engineFolder),
    socket: existsSync(paths.socket),
  };
}

/** Stops the latest start and keeps what it left right after it ended. */
export async function stopOnce(
  scene: StopScene,
  signal: NodeJS.Signals,
): Promise<Stop> {
  const ended = await scene.service.stop(signal);
  return { ...ended, signal, left: leftoversOf(scene) };
}

/**
 * A kill may come at any moment of a start, even before it listens. The
 * service is told to end only once it answered, since a process ends at
 * once on a signal that comes before it listens for one.
 */
async function untilStopMoment(
  scene: StopScene,
  plan: StopPlan,
  signal: NodeJS.Signals,
): Promise<void> {
  if (signal === 'SIGKILL') {
    await delay(scene.random.below(plan.killWithinMs));
    return;
  }
  await scene.service.send('/health');
  await delay(scene.random.below(plan.endWithinMs));
}

/** The signal of each stop, in an order the generator chooses. */
function signalsOf(scene: StopScene, plan: StopPlan): NodeJS.Signals[] {
  return scene.random.shuffled(
    Array.from({ length: plan.stops }, (_, index) =>
      index < plan.ends ? 'SIGTERM' : 'SIGKILL',
    ),
  );
}

/**
 * Stops the running start at random moments and starts the next one at
 * once, as often as the plan says, and leaves the last start running.
 */
export async function stopAtRandom(
  scene: StopScene,
  plan: StopPlan,
): Promise<Stop[]> {
  const signals = signalsOf(scene, plan);
  const stops: Stop[] = [];
  for (const signal of signals) {
    if (scene.halt.aborted) {
      return stops;
    }
    await untilStopMoment(scene, plan, signal);
    stops.push(await stopOnce(scene, signal));
    scene.service.start();
  }
  return stops;
}
