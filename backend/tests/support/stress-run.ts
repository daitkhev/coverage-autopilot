import { expect, vi } from 'vitest';

import { healthSchema } from '@coverage-autopilot/api-contracts/health';

import type { GhStandIn } from '#tests/support/gh-stand-in';
import type { StandInHost } from '#tests/support/hosted-built-service';
import {
  type DatabaseState,
  databaseStateOf,
} from '#tests/support/instance-state';
import {
  type PublishedBranch,
  publishedBranches,
} from '#tests/support/published-branches';
import {
  type Stop,
  stopAtRandom,
  stopOnce,
  type StopPlan,
  type StopScene,
} from '#tests/support/random-stops';
import {
  type Errand,
  type RepositoryWork,
  workOn,
} from '#tests/support/repository-work';
import type { RestartedService, Wait } from '#tests/support/restarted-service';
import { type SeededRandom, seededRandom } from '#tests/support/seeded-random';
import { playAtPace } from '#tests/support/stand-in-pace';
import { type StoredWork, storedWorkOf } from '#tests/support/stored-work';
import type { TemporaryCodeHost } from '#tests/support/temporary-code-host';
import { WIDGETS_FILES } from '#tests/support/widgets-project';

/** What the host holds of the work of the service. */
interface Published {
  readonly pulls: ReturnType<GhStandIn['pullRequests']>;
  /** The branches of the service on the remotes of every repository. */
  readonly branches: readonly PublishedBranch[];
}

/** What a run did and what it left, for the tests to judge. */
export interface StressRun {
  readonly work: readonly RepositoryWork[];
  /** Every stop, the last clean one included. */
  readonly stops: readonly Stop[];
  readonly logs: readonly string[];
  readonly stored: StoredWork;
  /** Whether the file of the database is sound. */
  readonly database: DatabaseState;
  readonly published: Published;
}

/** The sizes and the moments of a run. */
export interface StressSettings {
  readonly seed: number;
  readonly repositories: number;
  /** How long each command in a container, and each call of `gh`, takes. */
  readonly commandMs: number;
  readonly plan: StopPlan;
  /** How many improvements of a target are cancelled, and how soon. */
  readonly cancels: { readonly count: number; readonly withinMs: number };
  /** For every piece of work to end, through all the stops. */
  readonly workWait: Wait;
}

/** Where a run happens: the host and the service of one instance over it. */
export interface StressStage {
  readonly host: StandInHost;
  readonly service: RestartedService;
}

/** The work is over once no job holds its repository any more. */
async function untilIdle(stage: StressStage, wait: Wait): Promise<void> {
  await vi.waitFor(async () => {
    const answer = await stage.service.send('/health');
    const { activeWork } = healthSchema.parse(answer.body);
    expect(activeWork).toEqual({ scans: 0, improvements: 0 });
  }, wait);
}

/**
 * A repository of the widgets project on the host for each errand. The
 * errands that cancel, and when, are drawn before the stops draw.
 */
function errandsOn(
  stage: StressStage,
  settings: StressSettings,
  random: SeededRandom,
): Errand[] {
  const { repositories, cancels } = settings;
  const cancelling = random.shuffled(
    Array.from({ length: repositories }, (_, index) => index < cancels.count),
  );
  return cancelling.map((cancel, index) => {
    const name = `acme/widgets-${String(index + 1)}`;
    stage.host.host.createRepository(name, WIDGETS_FILES);
    const cancelAfterMs = cancel ? random.below(cancels.withinMs) : null;
    return { name, cancelAfterMs };
  });
}

function publishedOn(
  host: TemporaryCodeHost,
  work: readonly RepositoryWork[],
  stored: StoredWork,
): Published {
  return {
    pulls: host.gh.pullRequests(),
    branches: work.flatMap(({ name }) =>
      publishedBranches(host, name, stored.improvements),
    ),
  };
}

/**
 * Starts the service, and works on every repository with a client of its
 * own while the stops come. Once all the work ended and no job runs, the
 * service is told to end, and its database and the host are read.
 */
export async function stressRun(
  stage: StressStage,
  settings: StressSettings,
): Promise<StressRun> {
  const random = seededRandom(settings.seed);
  const errands = errandsOn(stage, settings, random);
  playAtPace(stage.host.engineFolder, settings.commandMs);
  stage.host.host.gh.answerAtPace(settings.commandMs);
  stage.service.start();
  const halt = new AbortController();
  const scene: StopScene = {
    service: stage.service,
    random,
    engineFolder: stage.host.engineFolder,
    halt: halt.signal,
  };
  const client = { service: stage.service, wait: settings.workWait };
  const stopping = stopAtRandom(scene, settings.plan);
  try {
    const [work, stops] = await Promise.all([
      Promise.all(errands.map(async (errand) => workOn(client, errand))),
      stopping,
    ]);
    await untilIdle(stage, settings.workWait);
    const last = await stopOnce(scene, 'SIGTERM');
    const stored = storedWorkOf(stage.service.paths.database);
    return {
      work,
      stops: [...stops, last],
      logs: stage.service.logs(),
      stored,
      database: databaseStateOf(stage.service.paths),
      published: publishedOn(stage.host.host, work, stored),
    };
  } finally {
    halt.abort();
    await Promise.allSettled([stopping]);
  }
}
